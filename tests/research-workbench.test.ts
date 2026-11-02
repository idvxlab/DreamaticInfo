import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const root = await mkdtemp(path.join(os.tmpdir(), "info-research-"));
process.env.INFO_CONFIG_DIR = root;
const store = await import("../apps/server/src/store.js");
const { ResearchWorkbench } = await import("../apps/server/src/research-workbench.js");
const { readProgress, updateProgress, readableSource, researchScope } = await import("../apps/server/src/research-state.js");
const { extractSource, fetchSource } = await import("../apps/server/src/network.js");
const { parseSearchPlan } = await import("../apps/server/src/research-plan.js");
const { validateProvenance } = await import("../apps/server/src/provenance.js");
const { saveRuntimeConfig } = await import("../apps/server/src/config-store.js");
const { default: ResearchProgress } = await import("../apps/web/src/ResearchProgress.js");
const plan = (rows = "| Q1 | 总体趋势 | population trend | 1 | worldbank |\n| Q2 | 年龄差异 | population age | 2 | worldbank |") => `# 搜索计划\n\n## 调研目标\n核实趋势与年龄差异；两类资料足以支持结论后停止，缺失指标说明局限。\n\n## 搜索队列\n\n| 编号 | 问题 | 关键词 | 优先级 | 目标来源 |\n| --- | --- | --- | --- | --- |\n${rows}`;
const article = "年度统计结果显示参与人数有所增加。数据按年度与年龄组分列，资料包含统计范围、采集方法、误差与来源说明。".repeat(10);
function response(text: string, contentType = "text/html") { return { text, contentType, url: "https://source.example/data", buffer: Buffer.from(text) }; }
try {
  await test("research plan validates unique queue entries, priorities, empty upload-only plans and saved limits", async () => {
    assert.equal(parseSearchPlan(plan(), false).length, 2);
    assert.throws(()=>parseSearchPlan(plan().replace("population trend","无"),false),/关键词尚未填写/);
    assert.throws(() => parseSearchPlan("## 调研目标\n使用上传资料\n\n## 搜索队列\n无", false), /不能为空/);
    assert.equal(parseSearchPlan("## 调研目标\n使用上传资料\n\n## 搜索队列\n无", true).length, 0);
    assert.throws(() => parseSearchPlan(plan().replace("population age", "Population  trend"), false), /不能重复/);
    assert.throws(() => parseSearchPlan(plan().replace("| 2 |", "| 4 |"), false), /优先级/);
    await saveRuntimeConfig({ values: { DREAMATIC_RESEARCH_MAX_TASKS: "1" } });
    assert.throws(() => parseSearchPlan(plan(), false), /条目上限/);
    await saveRuntimeConfig({ values: { DREAMATIC_RESEARCH_MAX_TASKS: "40" } });
  });
  await test("placeholder keyword records show the actual question and cannot issue a search request", async () => {
    const p=await store.create("Incomplete search plan","live");let calls=0;
    const w=await ResearchWorkbench.open(p,{search:async()=>{calls++;return [];},fetch:fetchSource});
    await w.savePlan(plan());
    await updateProgress(p,w.scope,state=>{state.tasks[0].query="无";state.tasks[0].question="财政货币政策";});
    const html=renderToStaticMarkup(createElement(ResearchProgress,{projectId:p.id,progress:await w.snapshot()}));
    assert.match(html,/<strong>财政货币政策<\/strong>/);assert.match(html,/待完善关键词/);assert.doesNotMatch(html,/<strong>无<\/strong>/);
    await assert.rejects(w.search("Q1"),/尚未发起搜索请求/);assert.equal(calls,0);
    assert.equal((await w.snapshot()).tasks[0].attempts,0);
  });
  await test("body extraction rejects challenge, login and thin pages but retains real articles and compact structured data", () => {
    assert.equal(extractSource(response('<title>Checking your browser - reCAPTCHA</title><body>Checking your browser before accessing the site</body>')).quality.status, "rejected");
    assert.equal(extractSource(response('<title>Sign in</title><main>Sign in to read the report</main>')).quality.status, "rejected");
    assert.equal(extractSource(response('<title>Article</title><main>tiny</main>')).quality.status, "rejected");
    const valid = extractSource(response(`<title>Report</title><meta property="article:published_time" content="2025-01-01"><nav>${"Noise".repeat(100)}</nav><article>${article}</article>`));
    assert.equal(valid.quality.status, "accepted"); assert.equal(valid.published_at, "2025-01-01"); assert.doesNotMatch(valid.text, /Noise/);
    assert.equal(extractSource(response('{"year":2025,"value":42}', "application/json")).quality.status, "accepted");
    assert.equal(extractSource(response('{"error":"unauthorized"}', "application/json")).quality.status, "rejected");
    assert.equal(extractSource(response('<title>Report</title><main>Subscribe to read the full report</main>')).quality.status, "rejected");
  });
  await test("plan is required, parallel searches persist without lost updates, and retries reuse saved candidates", async () => {
    const p = await store.create("Research concurrency", "live"); let calls = 0;
    const network = { search: async (query: string) => { calls++; await new Promise(r => setTimeout(r, 10)); return [{ title: query, url: "https://source.example/data", description: "Statistics" }]; }, fetch: fetchSource };
    const work = await ResearchWorkbench.open(p, network);
    await assert.rejects(work.search("Q1"), /先保存搜索计划/);
    await work.savePlan(plan());
    await Promise.all([work.search("Q1"), work.search("Q1"), work.search("Q2")]);
    assert.equal(calls, 2); assert.equal((await work.snapshot()).tasks.filter(t => t.status === "completed").length, 2);
    const retry = await ResearchWorkbench.open(p, network);
    assert.equal((await retry.search("Q1")).reused, true); assert.equal(calls, 2);
    assert.match(await retry.report(true), /https:\/\/source.example/);
    await retry.savePlan(plan("| Q2 | 年龄差异 | population age | 2 | worldbank |"));
    assert.equal((await retry.snapshot()).archived_tasks.length, 1);
    await retry.savePlan(plan().replace("总体趋势", "核对总体趋势"));
    assert.equal((await retry.search("Q1")).reused, true); assert.equal(calls, 2);
    const detail = await store.detail(p); assert.equal(detail.research_progress?.tasks[0].hits.length, 1);
    const changed = { ...p, brief: "Different research scope" }; assert.equal(await readProgress(changed), undefined);
  });
  await test("failed and interrupted searches retain reasons, require explicit retry and obey request budgets", async () => {
    const p = await store.create("Retry budget", "live"); let calls = 0;
    const work = await ResearchWorkbench.open(p, { search: async () => { calls++; throw new Error("HTTP 503 fixture"); }, fetch: fetchSource });
    await work.savePlan(plan());
    await assert.rejects(work.search("Q1"), /503/); await assert.rejects(work.search("Q1"), /retry=true/); assert.equal(calls, 1);
    await assert.rejects(work.search("Q1", undefined, true), /503/); await assert.rejects(work.search("Q1", undefined, true), /503/);
    await assert.rejects(work.search("Q1", undefined, true), /次数上限/); assert.equal(calls, 3);
    await saveRuntimeConfig({ values: { DREAMATIC_SEARCH_RESULTS: "9" } });
    await assert.rejects(work.search("Q1"), /503/); assert.equal(calls, 4);
    await saveRuntimeConfig({ values: { DREAMATIC_SEARCH_RESULTS: "8" } });
    await updateProgress(p, work.scope, state => { state.tasks[1].status = "running"; });
    const retry = await ResearchWorkbench.open(p);
    assert.match((await retry.snapshot()).tasks[1].error!, /中断/);
  });
  await test("sources are collected once, cached across sessions, checked for tampering and scoped to the current brief", async () => {
    const p = await store.create("Source reuse", "live"); let downloads = 0;
    const get = async () => { downloads++; await new Promise(r => setTimeout(r, 10)); return response(`<title>Official report</title><main>${article}</main>`); };
    const network = { search: async () => [], fetch: (id: string, url: string, signal?: AbortSignal) => fetchSource(id, url, signal, get) };
    const work = await ResearchWorkbench.open(p, network); await work.savePlan(plan());
    const [one, two] = await Promise.all([work.collect("https://source.example/data#top", "Q1"), work.collect("https://source.example/data", "Q1")]);
    assert.equal(downloads, 1); assert.equal(one.entry.source?.id, two.entry.source?.id); assert.equal(one.entry.status, "accepted");
    const retry = await ResearchWorkbench.open(p, network); assert.equal((await retry.collect("https://source.example/data", "Q1")).reused, true); assert.equal(downloads, 1);
    const source = one.entry.source!;
    await validateProvenance(p, "researcher", { sources: [source], datasets: [] });
    await assert.rejects(validateProvenance({ ...p, brief: "Changed" }, "researcher", { sources: [source], datasets: [] }), /当前调研范围/);
    await writeFile(path.join(store.projectDir(p.id), source.path), "tampered");
    await assert.rejects(readableSource(p, one.entry), /摘要不一致/);
    await retry.collect("https://source.example/data", "Q1"); assert.equal(downloads, 2);
    const html = renderToStaticMarkup(createElement(ResearchProgress, { projectId: p.id, progress: await retry.snapshot() }));
    assert.match(html, /搜索计划与采集进展/); assert.match(html, /查看已提取正文/); assert.match(html, /关键词队列/);
    const abstractProgress = await retry.snapshot();
    const abstractSource = abstractProgress.sources.find(source => source.status === "accepted")!;
    abstractSource.content_scope = "abstract"; abstractSource.reader = "ncbi-bioc"; abstractSource.url = "https://official.example/abstract-api";
    const abstractView = renderToStaticMarkup(createElement(ResearchProgress, { projectId: p.id, progress: abstractProgress }));
    assert.match(abstractView, /摘要可用 · 未取得全文/); assert.match(abstractView, /查看摘要/); assert.match(abstractView, /原始网页/); assert.match(abstractView, /官方读取接口/);

  });
  await test("rejected pages retain diagnostics but cannot enter a formal research report", async () => {
    const p = await store.create("Challenge rejection", "live"); let downloads = 0;
    const work = await ResearchWorkbench.open(p, { search: async () => [], fetch: (id, url, signal) => fetchSource(id, url, signal, async () => { downloads++; return response('<title>Checking your browser</title><body>Verify you are human</body>'); }) });
    await work.savePlan(plan()); const result = await work.collect("https://source.example/challenge", "Q1");
    assert.equal(result.entry.status, "rejected"); assert.ok(await readFile(path.join(store.projectDir(p.id), result.entry.raw_path!), "utf8"));
    await work.collect("https://source.example/challenge", "Q1"); assert.equal(downloads, 1);
    await assert.rejects(validateProvenance(p, "researcher", { sources: [result.entry.source], datasets: [] }), /通过正文检查/);
    const view = renderToStaticMarkup(createElement(ResearchProgress, { projectId: p.id, progress: await work.snapshot() }));
    assert.match(view, /正文不可用/); assert.doesNotMatch(view, />查看已提取正文</);
  });
} finally { await rm(root, { recursive: true, force: true }); }
