import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Browser, chromium } from "playwright";
const root = await mkdtemp(path.join(os.tmpdir(), "info-web-reader-"));
process.env.INFO_CONFIG_DIR = root;
const { followPublicRedirects, publicRequest, publicUrl } = await import("../apps/server/src/public-http.js");
const { readWebPage, readBrowserPage } = await import("../apps/server/src/web-reader.js");
const { extractSource } = await import("../apps/server/src/document-reader.js");
const { saveRuntimeConfig } = await import("../apps/server/src/config-store.js");
const paragraph = "A published report describes the scope, evidence, results and limitations of a documented study. ".repeat(12);
const reply = (url: string, text: string, status = 200, headers: Record<string, string | string[]> = {}) => ({ url, text, buffer: Buffer.from(text), status, headers, contentType: headers["content-type"] as string || "text/html" });
try {
  await test("redirects retain normal session cookies, allow revisiting with changed cookies and refuse unchanged loops", async () => {
    let calls = 0;
    const response = await followPublicRedirects("https://reader.example/start", undefined, undefined, async (url, _signal, _limit, headers) => {
      calls++;
      if (!headers?.Cookie) return reply(url, "", 307, { location: "/start", "set-cookie": "session=ready; Path=/; Secure" });
      assert.match(headers.Cookie, /session=ready/); return reply(url, paragraph);
    });
    assert.equal(calls, 2); assert.equal(response.redirect_chain.length, 2);
    await assert.rejects(followPublicRedirects("https://reader.example/loop", undefined, undefined, async url => reply(url, "", 302, { location: "/loop" })), /重定向循环/);
    await assert.rejects(followPublicRedirects("https://reader.example/first", undefined, undefined, async url => reply(url, "", 302, { location: "https://reader.example/" + Math.random() }), 2), /跳转超过配置/);
  });
  await test("public transport still rejects private destinations and unsupported URL schemes", async () => {
    assert.throws(() => publicUrl("file:///etc/passwd"), /仅支持/);
    await assert.rejects(publicRequest("https://127.0.0.1/private"), /私有网络/);
    await assert.rejects(followPublicRedirects("https://reader.example/start", undefined, undefined, async url => reply(url, "", 302, { location: "file:///etc/passwd" })), /仅支持/);
  });
  await test("Readability and Markdown conversion preserve headings, data tables and absolute source links without executing scripts", () => {
    const document = `<title>Public report</title><nav>${"Boilerplate".repeat(50)}</nav><article><h1>Research findings</h1><p>${paragraph}</p><table><thead><tr><th>Year</th><th>Value</th></tr></thead><tbody><tr><td>2025</td><td>42</td></tr></tbody></table><p><a href="/download/report.pdf">Download report</a></p><script>throw new Error('must not run')</script></article>`;
    const result = extractSource(reply("https://reader.example/article", document));
    assert.equal(result.quality.status, "accepted");
    assert.match(result.markdown, /# Research findings/); assert.match(result.markdown, /\| Year \| Value \|/); assert.match(result.markdown, /https:\/\/reader.example\/download\/report.pdf/);
    assert.doesNotMatch(result.markdown, /Boilerplate|must not run/);
  });
  await test("auto reader falls back for redirect failures or script shells, but not for rejected private destinations", async () => {
    let browsers = 0;
    const browser = async (url: string) => { browsers++; return { ...reply(url, `<article>${paragraph}</article>`), reader: "playwright+readability" }; };
    const result = await readWebPage("https://reader.example/article", undefined, async () => { throw new Error("重定向循环"); }, browser);
    assert.equal(result.reader, "playwright+readability"); assert.match(result.diagnostics![0], /重定向循环/);
    await readWebPage("https://reader.example/article", undefined, async url => reply(url, "<title>App</title><body><div id='root'></div></body>"), browser);
    assert.equal(browsers, 2);
    await saveRuntimeConfig({ values: { DREAMATIC_WEB_HTTP_TIMEOUT_MS: "1000" } });
    await readWebPage("https://reader.example/slow", undefined, async (_url, signal) => new Promise((_resolve, reject) => { const pendingIo = setTimeout(() => reject(new Error("fixture transport failed to cancel")), 5000); signal!.addEventListener("abort", () => { clearTimeout(pendingIo); reject(signal!.reason); }, { once: true }); }), browser);
    assert.equal(browsers, 3);
    await assert.rejects(readWebPage("https://reader.example/article", undefined, async () => { throw new Error("禁止访问本地或私有网络"); }, browser), /私有网络/);
    assert.equal(browsers, 3);
  });
  await test("isolated native Playwright waits for delayed content and preserves ordinary cookies and same-origin POST", { timeout: 30000 }, async () => {
    await saveRuntimeConfig({ values: { DREAMATIC_WEB_BROWSER_WAIT_MS: "0", DREAMATIC_WEB_BROWSER_READY_TIMEOUT_MS: "3000" } });
    let dataCalled = false;
    const result = await readBrowserPage("https://reader.example/app", AbortSignal.timeout(15000), { configureContext: async context => {
      await context.route("https://reader.example/**", async route => {
        const request = route.request();
        if (request.url().endsWith("/data")) {
          assert.equal(request.method(), "POST"); assert.match((await request.allHeaders()).cookie || "", /session=ready/);
          dataCalled = true; await route.fulfill({ json: { text: paragraph } });
        } else await route.fulfill({ contentType: "text/html", headers: { "set-cookie": "session=ready; Path=/; Secure" }, body: `<html><head><title>Dynamic report</title></head><body><article id="report"></article><script>setTimeout(()=>fetch('/data',{method:'POST',body:'public query'}).then(r=>r.json()).then(data=>document.querySelector('#report').textContent=data.text),650)</script></body></html>` });
      });
    } });
    assert.equal(result.reader, "chromium-native+readability"); assert.match(result.text, /published report/);
    assert.equal(dataCalled, true); assert.equal(extractSource(result).quality.status, "accepted");
  });
  await test("native browser blocks private subresources and enforces resource budgets", { timeout: 30000 }, async () => {
    await assert.rejects(readBrowserPage("https://reader.example/private", AbortSignal.timeout(10000), { configureContext: async context => {
      await context.route("https://reader.example/**", route => route.fulfill({ contentType: "text/html", body: `<article>${paragraph}</article><script>fetch('https://127.0.0.1/private').catch(()=>{})</script>` }));
    } }), /私有网络/);
    await saveRuntimeConfig({ values: { DREAMATIC_WEB_BROWSER_MAX_REQUESTS: "5" } });
    await assert.rejects(readBrowserPage("https://reader.example/budget", AbortSignal.timeout(10000), { configureContext: async context => {
      await context.route("https://reader.example/**", route => route.fulfill({ contentType: route.request().url().endsWith("/budget") ? "text/html" : "text/javascript", body: route.request().url().endsWith("/budget") ? `<article>${paragraph}</article>${Array.from({ length: 8 }, (_, i) => `<script src='/script-${i}.js'></script>`).join("")}` : "void 0;" }));
    } }), /请求数超过配置/);
  });
  await test("denials, cookie walls and long HTTP error pages never become source evidence", () => {
    for (const response of [reply("https://reader.example/article", "<title>403 Forbidden</title><p>Forbidden</p>"), reply("https://reader.example/article", "<title>Cookies must be enabled</title><p>Enable cookies for PubMed</p>"), reply("https://reader.example/article", `<article>${paragraph}</article>`, 403)]) {
      const result = extractSource(response); assert.equal(result.quality.status, "rejected"); assert.doesNotMatch(result.quality.reason, /正文过短/);
    }
  });
  await test("total timeout cancels browser launch promptly and closes a late-created browser", async () => {
    let closed = false;
    const controller = new AbortController();
    const launch = (async () => { await new Promise(resolve => setTimeout(resolve, 100)); return { close: async () => { closed = true; } } as unknown as Browser; }) as typeof chromium.launch;
    setTimeout(() => controller.abort(new Error("fixture cancellation")), 20);
    await assert.rejects(readBrowserPage("https://reader.example/article", controller.signal, { launch }), /fixture cancellation/);
    await new Promise(resolve => setTimeout(resolve, 150)); assert.equal(closed, true);
  });
} finally { await rm(root, { recursive: true, force: true }); }
