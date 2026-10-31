import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { DataFacts, Research, Source } from "../packages/shared/types.js";
const root = await mkdtemp(path.join(os.tmpdir(), "info-analysis-workbench-"));
process.env.INFO_CONFIG_DIR = root;
const store = await import("../apps/server/src/store.js");
const { AnalystWorkbench, AnalysisValidationError } = await import("../apps/server/src/analyst-workbench.js");
const { analystIssues } = await import("../apps/server/src/analyst-validation.js");
const { evidenceBlocks, matchingEvidence, evidenceText } = await import("../apps/server/src/evidence-view.js");
const { renderDocument } = await import("../apps/server/src/markdown-protocol.js");
const { hash } = await import("../apps/server/src/validation.js");
const { SubmissionPolicy } = await import("../apps/server/src/submission-policy.js");
const sourceId = "web-fixture-source";
const document = '# Public test report\n\n## Adults\n\n<table><tr><th>Year</th><th>People (thousand)</th></tr><tr><td>2024</td><td><strong>147,981.2</strong></td></tr><tr><td>2023</td><td>140,000.0</td></tr></table>\n\nDocumented methods and limitations.\n\nThis is a separate paragraph.\n';
const source: Source = { id: sourceId, title: "Public test report", kind: "web", url: "https://source.example/report", path: "research/test-report.md", published_at: null, accessed_at: "2026-10-31", fields: [], limitations: ["Deterministic fixture only"] };
const research: Research = { summary: "Test source", sources: [source], datasets: [], limitations: [] };
const fact = (id: string) => ({ id, title: "Test statistic", type: "value" as const, derivation: "quoted" as const, specification: { series_unit: "无", scope: "测试来源的完整范围", measure: "测试度量", breakdown: "测试分组", focus: "全部对象", method: "原文引用", aggregation: "none" as const, distribution_kind: "none" as const, calculation_id: null }, description: "A table observation", value: 147981.2, unit: "thousand", evidence: [{ source_id: sourceId, quote: "| 2024 | 147,981.2 |", location: "Adults table" }], source_ids: [sourceId], analysis: "Copy the observation without generalization", context: "Test only", importance: 0.8, relations: [], confidence: { score: 0.9, reason: "Recorded test table" }, series: [] });
const data = (): DataFacts => ({ summary: "Test findings", facts: [fact("F-001"), fact("F-002")] });
function revision(text: string) { const match = /草稿版本：([a-f0-9-]{36})/.exec(text); assert.ok(match); return match[1]; }
function factMarkdown(value: ReturnType<typeof fact>) { return renderDocument("analyst", { summary: "Patch", facts: [value] }).split("## 数据事实\n\n")[1].split("## 说明")[0].trim(); }
async function project() { const p = await store.create("Analysis fixture", "live"); await writeFile(path.join(store.projectDir(p.id), source.path), document); return p; }
try {
  await test("evidence view preserves table cells, units, years and paragraph boundaries while normalizing display markup", () => {
    const view = { source, digest: hash(document), blocks: evidenceBlocks(source.id, hash(document), document) };
    const block = view.blocks.find(item => item.text.includes("147,981.2"))!;
    assert.equal(matchingEvidence(view, "| 2024 | **147,981.2** |", block.id), true);
    for (const quote of ["2024: 147,981.2", "| 2023 | 147,981.2 |", "| 2024 | 147,981.3 |", "2024 147,981.2", "Documented methods and limitations. This is a separate paragraph."]) assert.equal(matchingEvidence(view, quote), false, quote);
    assert.equal(matchingEvidence(view, "| 2024 | 147,981.2 |", "E-0000000000000000"), false);
    assert.equal(matchingEvidence(view, "| 2024 | 147,981.2 |", "E-bad-id"), false);
    assert.notEqual(evidenceText("10<sup>9</sup>"), evidenceText("109"));
    assert.notEqual(evidenceText("12 kg"), evidenceText("12 g"));
    const cells = evidenceBlocks(source.id, "test", "<table><tr><td>1<br>2</td><td>3</td></tr></table>");
    assert.match(evidenceBlocks(source.id, "complex", "<table><tr><td colspan=\"2\">2024</td></tr></table>")[0].text, /colspan/);
    assert.match(cells[0].text, /1 2/); assert.doesNotMatch(cells[0].text, /12/);
  });
  await test("validation reports illegal relation enums, all unknown source aliases and wrong quotations together", async () => {
    const p = await project(), draft = data();
    draft.facts[0].source_ids = ["S-01"]; draft.facts[0].evidence[0].source_id = "S-01";
    draft.facts[1].evidence[0].quote = "| 2024 | 999,999.0 |";
    draft.facts[1].relations = [{ target_id: "F-001", type: "distribution", basis: "Test invalid relation" } as any];
    const issues = await analystIssues(p, draft, research);
    assert.ok(issues.some(issue => issue.location.includes("F-002") && issue.message.includes("distribution") && issue.fix.includes("comparison")));
    assert.ok(issues.some(issue => issue.fact === "F-001" && issue.message.includes("S-01")));
    assert.ok(issues.some(issue => issue.fact === "F-002" && issue.message.includes("999,999.0")));
  });
  await test("association validation distinguishes coefficients from quoted OR/RR/HR without weakening source checks", async () => {
    const p = await project();
    const quote = "Synthetic statistics: OR = 2.86; RR = 1.4; HR = 0.7; r = -0.5.";
    await writeFile(path.join(store.projectDir(p.id), source.path), "# Fixture\n\n" + quote);
    const association = (unit: string, value: number | string) => ({ ...fact("F-001"), type: "correlation", unit, value, evidence: [{ source_id: sourceId, quote, location: "Fixture" }] });
    for (const [unit, value] of [["OR", 2.86], ["RR", 1.4], ["HR", .7], ["aOR", 2.86], ["r", -.5], ["ρ", 1], ["τ", -1]] as const) {
      assert.deepEqual(await analystIssues(p, { summary: "Fixture", facts: [association(unit, value)] }, research), []);
    }
    for (const [unit, value] of [["ARR", 2.86], ["r", 2.86], ["OR", -1], ["RR", -1], ["HR", -1], ["无", 2.86], ["OR", "2.86"], ["r", Infinity]] as const) {
      assert.ok((await analystIssues(p, { summary: "Fixture", facts: [association(unit, value)] }, research)).length, `${unit} ${value}`);
    }
    const invalid = association("OR", 2.86); invalid.evidence[0].quote = "invented quotation";
    assert.ok((await analystIssues(p, { summary: "Fixture", facts: [invalid] }, research)).some(issue => issue.location.includes("证据")));
  });
  await test("invalid drafts survive recovery, local repairs preserve other facts, new facts append, and final revision submits without resending Markdown", async () => {
    const p = await project(), work = await AnalystWorkbench.open(p, research), draft = data();
    draft.facts[0].evidence[0].quote = "not an original quote"; draft.facts[1].evidence[0].quote = "also not an original quote";
    await assert.rejects(work.saveDraft(renderDocument("analyst", draft)), AnalysisValidationError);
    const first = await work.readDraft(); assert.match(first, /F-001/); assert.match(first, /F-002/);
    const before = await work.readDraft("F-002");
    const repaired = await work.patchFact(revision(first), "F-001", factMarkdown(fact("F-001")));
    assert.match(repaired, /已通过的事实：F-001/); assert.match(repaired, /未通过/);
    assert.equal((await work.readDraft("F-002")).split("### 条目 2")[1], before.split("### 条目 2")[1]);
    const recovered = await AnalystWorkbench.open(p, research);
    assert.equal(revision(await recovered.readDraft()), revision(repaired));
    await assert.rejects(recovered.submit(undefined, revision(repaired)), AnalysisValidationError);
    await assert.rejects(recovered.patchFact(revision(first), "F-002", factMarkdown(fact("F-002"))), /版本已变化/);
    const fixed = await recovered.patchFact(revision(repaired), "F-002", factMarkdown(fact("F-002")));
    const appended = await recovered.patchFact(revision(fixed), "F-003", factMarkdown(fact("F-003")));
    const result = await recovered.submit(undefined, revision(appended));
    assert.equal(result.data.facts.length, 3); assert.equal(result.data.facts[0].id, "F-001");
    assert.equal((await store.get(p.id)).state.stages.analyst.status, "pending");
    await assert.rejects(readFile(path.join(store.projectDir(p.id), "datafacts.md")), /ENOENT/);
  });
  await test("Markdown separators preserve draft cards while genuine evidence errors remain attached to individual facts", async () => {
    const p = await project(), draft = data();
    draft.facts[1].evidence[0].quote = "not present in the source";
    const markdown = renderDocument("analyst", draft).replace("\n### 条目 2", "\n---\n\n### 条目 2");
    const work = await AnalystWorkbench.open(p, research);
    await assert.rejects(work.saveDraft(markdown), AnalysisValidationError);
    const recovered = await AnalystWorkbench.open(p, research, undefined, { readOnly: true });
    const progress = await recovered.progress();
    assert.equal(progress.status, "draft");
    assert.deepEqual(progress.counts, { saved: 2, verified: 1, needs_revision: 1 });
    assert.equal(progress.issues.filter(issue => !issue.fact).length, 0);
    assert.ok(progress.issues.every(issue => issue.fact === "F-002"));
    assert.equal(await recovered.document("draft", revision(await recovered.readDraft())), markdown);
    await assert.rejects(recovered.submit(undefined, revision(await recovered.readDraft())), AnalysisValidationError);
  });
  await test("source changes invalidate cached evidence, new inputs isolate drafts and stale concurrent revisions cannot overwrite each other", async () => {
    const p = await project(), work = await AnalystWorkbench.open(p, research, { scope: "original" });
    const saved = await work.saveDraft(renderDocument("analyst", data()));
    const edits = await Promise.allSettled([work.patchFact(revision(saved), "F-001", factMarkdown({ ...fact("F-001"), title: "First edit" })), work.patchFact(revision(saved), "F-001", factMarkdown({ ...fact("F-001"), title: "Stale edit" }))]);
    assert.equal(edits.filter(result => result.status === "fulfilled").length, 1);
    assert.match(await work.readDraft("F-001"), /First edit/); assert.doesNotMatch(await work.readDraft("F-001"), /Stale edit/);
    const newIntent = await AnalystWorkbench.open(p, research, { scope: "changed" }); assert.match(await newIntent.readDraft(), /没有草稿/);
    await writeFile(path.join(store.projectDir(p.id), source.path), document.replace("147,981.2", "147,981.3"));
    await assert.rejects(work.submit(undefined, revision(saved)), /来源内容已变化/);
    const changed = await AnalystWorkbench.open(p, research, { scope: "original" }); assert.match(await changed.readDraft(), /没有草稿/);
  });
  await test("formal submission failure budgets use stable issues rather than changing revision IDs", async () => {
    const p = await project(), work = await AnalystWorkbench.open(p, research), draft = data(), policy = new SubmissionPolicy();
    draft.facts[0].evidence[0].quote = "fabricated text";
    for (let i = 0; i < 3; i++) {
      try { await work.submit(renderDocument("analyst", draft)); assert.fail("must reject"); }
      catch (error) { assert.ok(error instanceof AnalysisValidationError); policy.reject(error); }
    }
    assert.ok(policy.fatal); assert.match(policy.fatal.message, /阶段已停止/);
  });
} finally { await rm(root, { recursive: true, force: true }); }
