import { extractSource } from "./document-reader.js";
export { extractSource } from "./document-reader.js";
import { readWebPage } from "./web-reader.js";
import { publicGet } from "./public-http.js";
export { publicGet, publicAddress } from "./public-http.js";
import { setting } from "./config-store.js";
import { load } from "cheerio";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { now, projectDir } from "./store.js";
export async function searchWeb(
  query: string,
  signal?: AbortSignal,
  transport: { fetch: typeof fetch; publicGet: typeof publicGet } = {
    fetch,
    publicGet,
  },
) {
  const provider = setting("DREAMATIC_SEARCH_PROVIDER"),
    key = setting("DREAMATIC_SEARCH_API_KEY"),
    count = Number(setting("DREAMATIC_SEARCH_RESULTS"));
  if (provider === "serper") {
    if (!key) throw new Error("请配置 Serper 搜索密钥");
    const r = await transport.fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num: count }),
      signal: AbortSignal.any([
        signal ?? new AbortController().signal,
        AbortSignal.timeout(Number(setting("DREAMATIC_NETWORK_TIMEOUT_MS"))),
      ]),
    });
    if (!r.ok) throw new Error(`Search HTTP ${r.status}`);
    const d: any = await r.json();
    return (d.organic || []).slice(0, count).map((r: any) => ({
      title: r.title,
      url: r.link,
      description: r.snippet || "",
    }));
  }
  if (provider === "brave" || (provider === "auto" && key)) {
    if (!key) throw new Error("请配置 Brave 搜索密钥");
    const res = await transport.fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`,
      {
        headers: { "X-Subscription-Token": key },
        signal: AbortSignal.any([
          signal ?? new AbortController().signal,
          AbortSignal.timeout(Number(setting("DREAMATIC_NETWORK_TIMEOUT_MS"))),
        ]),
      },
    );
    if (!res.ok) throw new Error(`Search HTTP ${res.status}`);
    const data: any = await res.json();
    return (
      data.web?.results?.slice(0, count).map((r: any) => ({
        title: r.title,
        url: r.url,
        description: r.description,
      })) || []
    );
  }
  if (provider !== "duckduckgo")
    try {
      const { text } = await transport.publicGet(
        `https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`,
        signal,
      );
      const $ = load(text, { xml: true });
      const rows = $("item")
        .toArray()
        .slice(0, count)
        .map((el) => ({
          title: $(el).find("title").text(),
          url: $(el).find("link").text(),
          description: $(el).find("description").text(),
        }))
        .filter((x) => x.url.startsWith("https://"));
      if (rows.length) return rows;
      if (provider === "bing") throw new Error("Bing 未返回可用搜索结果");
    } catch (e) {
      if (signal?.aborted || provider === "bing") throw e;
    }
  const { text } = await transport.publicGet(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    signal,
  );
  const $ = load(text);
  const results = $(".result")
    .toArray()
    .slice(0, count)
    .map((el) => {
      const a = $(el).find(".result__a");
      const raw = a.attr("href") || "";
      let url = raw;
      try {
        url =
          new URL(raw, "https://duckduckgo.com").searchParams.get("uddg") ||
          raw;
      } catch {}
      return {
        title: a.text(),
        url,
        description: $(el).find(".result__snippet").text(),
      };
    })
    .filter((r) => r.url.startsWith("https:"));
  if (!results.length)
    throw new Error("搜索服务未返回可用来源，请配置搜索 API 密钥 或上传资料");
  return results;
}
export async function fetchSource(id: string, url: string, signal?: AbortSignal, get?: typeof publicGet) {
  const response = get ? await get(url, signal) : await readWebPage(url, signal), sid = `web-${randomUUID()}`, root = projectDir(id);
  if (!/text|json|csv|xml/.test(response.contentType)) throw new Error("此来源是二进制文件，请下载后上传");
  const extracted = extractSource(response), raw_path = `research/${sid}.raw.txt`, rel = `research/${sid}.md`;
  if (response.content_scope === "abstract" && extracted.quality.status === "accepted") extracted.quality.reason = "官方摘要已取得，尚未取得论文全文；内容及统计口径仍需核实";
  await writeFile(path.join(root, raw_path), response.raw_text ?? response.text);
  const rendered_path = response.reader === "chromium-native+readability" || response.reader === "ncbi-bioc" ? `research/${sid}.rendered.txt` : undefined;
  if (rendered_path) await writeFile(path.join(root, rendered_path), response.text);
  const document = `# ${extracted.title}\n\nURL: ${response.url}\n采集: ${now()}\n阅读器: ${response.reader ?? "http+readability"}\n正文检查: ${extracted.quality.reason}\n资料范围: ${response.content_scope === "abstract" ? "仅摘要，未取得全文" : response.content_scope === "fulltext" ? "官方开放全文文本" : "网页提取内容"}\n局限: ${(response.limitations ?? []).join("；") || "内容及统计口径仍需核实"}\n\n${extracted.markdown}`;
  await writeFile(path.join(root, rel), document);
  return { id: sid, title: extracted.title, url: response.url, published_at: extracted.published_at, accessed_at: now(), kind: "web" as const, path: rel, fields: [] as string[], limitations: response.limitations ?? [] as string[], preview: extracted.text.slice(0, 4000), raw_path, rendered_path, document, reader: response.reader ?? "http+readability", redirect_chain: response.redirect_chain ?? [url], diagnostics: response.diagnostics ?? [], quality: extracted.quality, content_scope: response.content_scope };
}
