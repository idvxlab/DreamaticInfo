import https from "node:https";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { gunzipSync, brotliDecompressSync, inflateSync } from "node:zlib";
import { CookieJar } from "tough-cookie";
import { setting } from "./config-store.js";
import { policy } from "./policy.js";
export interface PublicResponse { text: string; buffer: Buffer; url: string; contentType: string; status: number; headers: Record<string, string | string[] | undefined>; redirect_chain?: string[] }
export type WebResponse = Pick<PublicResponse, "text" | "buffer" | "url" | "contentType"> & Partial<Pick<PublicResponse, "status" | "headers" | "redirect_chain">> & { reader?: string; diagnostics?: string[]; raw_text?: string; limitations?: string[]; content_scope?: "abstract" | "fulltext" };
export function publicAddress(address: string) { return ipaddr.process(address).range() === "unicast"; }
export function publicUrl(url: string) {
  const u = new URL(url);
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) throw new Error("仅支持公开 HTTPS 来源");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && !publicAddress(host)) throw new Error("禁止访问本地或私有网络");
  return u;
}
export async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener("abort", aborted, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
    if (signal.aborted) aborted();
  });
}
/** Single hop: validate every resolved address and pin the actual connection to the selected public IP. */
export async function publicRequest(url: string, signal?: AbortSignal, maxBytes = policy.max_fetch_bytes, headers: Record<string, string> = {}): Promise<PublicResponse> {
  const u = publicUrl(url);
  const effectiveSignal = AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(Number(setting("DREAMATIC_NETWORK_TIMEOUT_MS")))]);
  effectiveSignal.throwIfAborted();
  const addresses = await abortable(lookup(u.hostname, { all: true }), effectiveSignal);
  effectiveSignal.throwIfAborted();
  if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw new Error("禁止访问本地或私有网络");
  const address = addresses[0];
  return new Promise((resolve, reject) => {
    const req = https.get(u, { signal: effectiveSignal, headers: { "User-Agent": "DreamaticInfo/0.1 (research)", Accept: "text/html,text/plain,application/json,text/csv", "Accept-Encoding": "identity", ...headers }, lookup: (_host, _options, cb) => cb(null, [{ address: address.address, family: address.family }]) }, res => {
      const chunks: Buffer[] = []; let length = 0;
      res.on("data", chunk => { length += chunk.length; if (length > maxBytes) req.destroy(new Error(`来源响应超过配置的字节上限（${maxBytes} 字节）`)); else chunks.push(chunk); });
      res.on("error", reject);
      res.on("end", () => {
        try {
          let buffer = Buffer.concat(chunks);
          const encoding = res.headers["content-encoding"], options = { maxOutputLength: maxBytes };
          if (encoding === "gzip") buffer = gunzipSync(buffer, options);
          else if (encoding === "br") buffer = brotliDecompressSync(buffer, options);
          else if (encoding === "deflate") buffer = inflateSync(buffer, options);
          const contentType = String(res.headers["content-type"] || ""), charset = /charset=([^;\s]+)/i.exec(contentType)?.[1]?.replace(/["']/g, "") || "utf-8";
          let text: string;
          try { text = new TextDecoder(charset).decode(buffer); } catch { text = buffer.toString("utf8"); }
          resolve({ text, buffer, url: u.href, status: res.statusCode ?? 0, contentType, headers: res.headers });
        } catch (error) { reject(error); }
      });
    });
    req.setTimeout(Number(setting("DREAMATIC_NETWORK_TIMEOUT_MS")), () => req.destroy(new Error("Source request timeout")));
    req.on("error", reject);
  });
}
type Hop = (url: string, signal?: AbortSignal, maxBytes?: number, headers?: Record<string, string>) => Promise<PublicResponse>;
/** Per-read cookie jar: handles normal session redirects without sharing credentials across projects. */
export async function followPublicRedirects(url: string, signal?: AbortSignal, maxBytes = policy.max_fetch_bytes, send: Hop = publicRequest, maximum = Number(setting("DREAMATIC_WEB_MAX_REDIRECTS")), acceptErrorStatus = false) {
  const jar = new CookieJar(), chain: string[] = [], visited = new Set<string>();
  let current = publicUrl(url).href;
  for (let hop = 0; hop <= maximum; hop++) {
    signal?.throwIfAborted();
    const cookie = await jar.getCookieString(current), signature = `${current}\n${cookie}`;
    if (visited.has(signature)) throw new Error(`网页发生重定向循环（Cookie 未推进会话）：${[...chain, current].join(" → ")}`);
    visited.add(signature); chain.push(current);
    const response = await send(current, signal, maxBytes, cookie ? { Cookie: cookie } : {});
    const cookies = response.headers["set-cookie"];
    for (const item of typeof cookies === "string" ? [cookies] : cookies || []) await jar.setCookie(item, current, { ignoreError: true });
    const location = response.headers.location;
    if ([301, 302, 303, 307, 308].includes(response.status) && typeof location === "string") { current = publicUrl(new URL(location, current).href).href; continue; }
    if (!response.status || (!acceptErrorStatus && response.status >= 400)) throw new Error(`HTTP ${response.status}：${current}`);
    return { ...response, redirect_chain: chain };
  }
  throw new Error(`网页跳转超过配置的 ${maximum} 次上限：${chain.join(" → ")}`);
}
export async function publicGet(url: string, signal?: AbortSignal, _redirects = 0, maxBytes = policy.max_fetch_bytes): Promise<WebResponse> {
  return followPublicRedirects(url, AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(Number(setting("DREAMATIC_NETWORK_TIMEOUT_MS")))]), maxBytes);
}
