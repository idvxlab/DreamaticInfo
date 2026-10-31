import { chromium, type Browser } from "playwright";
import { createBrowserEgress } from "./browser-egress.js";
import { setting } from "./config-store.js";
import { policy } from "./policy.js";
import { browserOptions } from "./browser.js";
import { publicGet, publicUrl, abortable, type WebResponse } from "./public-http.js";
import { scholarlyTarget, readScholarly } from "./scholarly-reader.js";
import { extractSource } from "./document-reader.js";
let active = 0;
async function acquire(signal: AbortSignal) {
  while (active >= Number(setting("DREAMATIC_WEB_BROWSER_CONCURRENCY"))) {
    signal.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(signal.reason); };
      const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 50);
      signal.addEventListener("abort", abort, { once: true });
    });
  }
  signal.throwIfAborted(); active++;
}
export type BrowserReaderOptions = { createEgress?: typeof createBrowserEgress; launch?: typeof chromium.launch; configureContext?: (context: import("playwright").BrowserContext) => Promise<void> };
/** Isolated native Chromium networking, behind a DNS-pinned public-only CONNECT tunnel. */
export async function readBrowserPage(url: string, signal: AbortSignal, options: BrowserReaderOptions = {}): Promise<WebResponse> {
  publicUrl(url); await acquire(signal);
  let browser: Browser | undefined, egress: Awaited<ReturnType<typeof createBrowserEgress>> | undefined, fatal: Error | undefined;
  const failures: string[] = [];
  const fail = (error: Error) => { fatal ??= error; void browser?.close().catch(() => {}); };
  const cancel = () => { void browser?.close().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    egress = await (options.createEgress ?? createBrowserEgress)(signal, fail, { report: message => { if (failures.length < 12) failures.push(message); } });
    const launching = (options.launch ?? chromium.launch.bind(chromium))({ headless: true, timeout: Number(setting("DREAMATIC_WEB_READER_TIMEOUT_MS")), ...(await browserOptions()), proxy: { server: egress.server, bypass: "<-loopback>" }, args: ["--disable-quic", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp"] });
    void launching.then(instance => { if (signal.aborted) void instance.close().catch(() => {}); }, () => {});
    browser = await abortable(launching, signal); signal.throwIfAborted();
    const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false });
    await options.configureContext?.(context);
    await context.routeWebSocket("**/*", socket => socket.close());
    const page = await context.newPage();
    context.on("page", opened => { if (opened !== page) void opened.close(); });
    page.on("dialog", dialog => void dialog.dismiss());
    const chain: string[] = [];
    let requests = 0, decodedBytes = 0, finalResponse: import("playwright").Response | undefined;
    context.on("request", request => {
      if (++requests > Number(setting("DREAMATIC_WEB_BROWSER_MAX_REQUESTS"))) fail(new Error("网页浏览器请求数超过配置上限"));
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
        chain.push(request.url());
        if (chain.length > Number(setting("DREAMATIC_WEB_MAX_REDIRECTS")) + 1) fail(new Error("网页浏览器导航超过配置上限"));
      }
    });
    const network = await context.newCDPSession(page);
    await network.send("Network.enable");
    const resourceBytes = new Map<string, number>();
    network.on("Network.dataReceived", event => {
      decodedBytes += event.dataLength;
      const count = (resourceBytes.get(event.requestId) ?? 0) + event.dataLength;
      resourceBytes.set(event.requestId, count);
      if (count > policy.max_fetch_bytes || decodedBytes > Number(setting("DREAMATIC_WEB_BROWSER_MAX_BYTES"))) fail(new Error("网页浏览器解压后的响应超过配置的字节上限"));
    });
    page.on("response", response => {
      if (response.request().isNavigationRequest() && response.frame() === page.mainFrame()) finalResponse = response;
    });
    await context.route("**/*", async route => {
      const request = route.request();
      try {
        signal.throwIfAborted(); if (fatal) throw fatal;
        publicUrl(request.url());
        const preflight = request.method() === "OPTIONS" && ["GET", "HEAD", "POST"].includes(request.headers()["access-control-request-method"] ?? "");
        const normalMethod = preflight || ["GET", "HEAD"].includes(request.method()) || (request.method() === "POST" && ["xhr", "fetch"].includes(request.resourceType()) && (request.postDataBuffer()?.length ?? 0) <= 65536);
        if (!normalMethod || (!preflight && !["document", "script", "stylesheet", "xhr", "fetch"].includes(request.resourceType()))) { await route.abort(); return; }
        // Redirects and subresources use Chromium's TLS, cookies and redirect handling.
        // The CONNECT proxy also guards redirects which Playwright routing does not intercept.
        await route.fallback();
      } catch (error) { fail(error instanceof Error ? error : new Error(String(error))); await route.abort().catch(() => {}); }
    });
    page.on("requestfailed", request => { if (failures.length < 12) failures.push(`${request.url()}：${request.failure()?.errorText || "请求失败"}`); });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: Number(setting("DREAMATIC_WEB_READER_TIMEOUT_MS")) });
    await page.waitForTimeout(Number(setting("DREAMATIC_WEB_BROWSER_WAIT_MS")));
    const deadline = Date.now() + Number(setting("DREAMATIC_WEB_BROWSER_READY_TIMEOUT_MS"));
    let text = "", previous = "", finalUrl = url, snapshotResponse: import("playwright").Response | undefined;
    do {
      signal.throwIfAborted(); if (fatal) throw fatal;
      try {
        const snapshot = await page.content();
        text = snapshot; finalUrl = page.url(); snapshotResponse = finalResponse;
      } catch (error) {
        if (!/navigating and changing the content|execution context was destroyed/i.test(String(error))) throw error;
        if (Date.now() >= deadline) { if (text) break; throw new Error("网页持续跳转，未取得稳定正文"); }
        await page.waitForTimeout(Math.min(500, deadline - Date.now())); continue;
      }
      const extracted = extractSource({ text, url: finalUrl, contentType: "text/html", status: snapshotResponse?.status() });
      if (extracted.quality.status === "accepted" && extracted.text === previous) break;
      // Plain denial pages cannot load additional content. Scripted verification pages may still resolve normally.
      if (snapshotResponse?.status() === 403 && !/<script[\s>]/i.test(text)) break;
      previous = extracted.text;
      if (Date.now() >= deadline) break;
      await page.waitForTimeout(Math.min(500, deadline - Date.now()));
    } while (true);
    signal.throwIfAborted(); if (fatal) throw fatal;
    publicUrl(finalUrl);
    const buffer = Buffer.from(text);
    if (buffer.length > policy.max_fetch_bytes) throw new Error("渲染后的网页超过采集字节上限");
    const raw = await snapshotResponse?.text().catch(() => undefined);
    signal.throwIfAborted(); if (fatal) throw fatal;
    return { text, buffer, url: finalUrl, status: snapshotResponse?.status(), contentType: "text/html; charset=utf-8", redirect_chain: chain, reader: "chromium-native+readability", raw_text: raw, diagnostics: failures.slice(0, 12) };
  } catch (error) { if (signal.aborted) throw signal.reason; throw fatal ?? error; }
  finally { signal.removeEventListener("abort", cancel); await browser?.close().catch(() => {}); await egress?.close(); active--; }
}
export async function readWebPage(url: string, parent?: AbortSignal, http = publicGet, browser = readBrowserPage): Promise<WebResponse> {
  const signal = AbortSignal.any([parent ?? new AbortController().signal, AbortSignal.timeout(Number(setting("DREAMATIC_WEB_READER_TIMEOUT_MS")))]);
  // PMC requires automated retrieval through its designated APIs, not browser scraping.
  if (scholarlyTarget(url)) return readScholarly(url, signal, http);
  const mode = setting("DREAMATIC_WEB_READER");
  const notes: string[] = [];
  if (mode !== "browser") {
    try {
      const response = await http(url, AbortSignal.any([signal, AbortSignal.timeout(Number(setting("DREAMATIC_WEB_HTTP_TIMEOUT_MS")))]));
      if (mode === "http" || !/html/i.test(response.contentType) || extractSource(response).quality.status === "accepted") return { ...response, reader: "http+readability" };
      notes.push(`HTTP 正文不可用：${extractSource(response).quality.reason}`);
    } catch (error) {
      if (signal.aborted || mode === "http") throw error;
      if (/禁止访问|仅支持/.test(String(error))) throw error;
      notes.push(String(error));
    }
  }
  signal.throwIfAborted();
  try {
    const rendered = await browser(url, signal);
    return { ...rendered, diagnostics: [...notes, ...(rendered.diagnostics ?? [])] };
  } catch (error) { throw new Error(`网页阅读失败：${[...notes, String(error)].join("；")}`); }
}
