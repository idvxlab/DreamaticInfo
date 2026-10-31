import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AnalysisProgress as Progress, Fact, ProjectDetail } from "../packages/shared/types.js";
import AnalysisProgress from "../apps/web/src/AnalysisProgress.js";
const fact: Fact = { id: "F-001", title: "Saved observation", type: "value", derivation: "quoted" as const, specification: { series_unit: "无", scope: "测试来源的完整范围", measure: "测试度量", breakdown: "测试分组", focus: "全部对象", method: "原文引用", aggregation: "none" as const, distribution_kind: "none" as const, calculation_id: null }, description: "A test observation", value: 42, unit: "people", analysis: "Needs the original source", context: "Test only", source_ids: ["source-1"], evidence: [{ source_id: "source-1", quote: "<script>untrusted quotation</script>", location: "Table 1" }], importance: 0.8, confidence: { score: 0.8, reason: "Model estimate" }, series: [], relations: [] };
const p = { id: "test-project", state: { stages: { analyst: { status: "running", attempts: 1 } } }, research: { sources: [{ id: "source-1", title: "Original source" }] } } as unknown as ProjectDetail;
const progress: Progress = { status: "draft", revision: "12345678-1234-1234-1234-123456789012", updated_at: "2026-10-31T00:00:00Z", summary: "Work in progress", facts: [{ key: "fact-0", fact, status: "verified", issues: [] }, { key: "fact-1", fact: { ...fact, id: "F-002", confidence: { score: 8, reason: "Bad scale" } }, status: "needs_revision", issues: [{ fact: "F-002", location: "F-002／第 1 条证据", message: "引文不在原文中", fix: "复制同一证据块原文" }] }], issues: [{ fact: "F-002", location: "F-002／第 1 条证据", message: "引文不在原文中", fix: "复制同一证据块原文" }], counts: { saved: 2, verified: 1, needs_revision: 1 }, message: "分析草稿，尚未正式提交。" };
const render = (value?: Progress, project = p) => renderToStaticMarkup(createElement(AnalysisProgress, { project, progress: value }));
test("facts progress distinguishes drafts and checks, shows evidence and actionable errors, and escapes untrusted material", () => {
  const html = render(progress);
  for (const text of ["尚未正式提交", "已保存事实", "校验通过", "待修正事实", "草稿 · 校验通过", "草稿 · 待修正", "复制同一证据块原文", "原文中", "模型自评 80%", "可信度待修正"]) assert.ok(html.includes(text), text);
  assert.match(html, /analysis\/draft\?revision=/); assert.match(html, /analysis\/validation\?revision=/);
  assert.match(html, /&lt;script&gt;untrusted quotation/); assert.doesNotMatch(html, /<script>/);
  assert.match(html, /仅看待修正/); assert.match(html, /最近保存/);
});
test("paused drafts remain visible, malformed documents show global issues, and stale snapshots never show old cards", () => {
  assert.match(render(progress, { ...p, state: { ...p.state, stages: { ...p.state.stages, analyst: { status: "interrupted", attempts: 1 } } } }), /已保存草稿保留/);
  const malformed = { ...progress, facts: [], counts: { saved: 0, verified: 0, needs_revision: 0 }, issues: [{ location: "文档格式", message: "缺少数据事实章节", fix: "修正整体结构" }] };
  const html = render(malformed); assert.match(html, /文档结构与整体问题/); assert.match(html, /尚不可解析/); assert.match(html, /查看草稿 Markdown/);
  const stale = render({ ...progress, status: "stale", message: "来源已变化" });
  assert.match(stale, /旧草稿已失效/); assert.doesNotMatch(stale, /Saved observation/);
  assert.match(render(undefined), /正在提取数据事实/);
});

test("unvalidated draft enum values cannot break fact card rendering", () => {
  const invalid = { ...progress, facts: [{ ...progress.facts[0], fact: { ...fact, type: "__proto__" as Fact["type"] } }] };
  assert.match(render(invalid), /类型待修正/);
});

test("new fact types show separate derivation, statistical scope and series units", () => {
  const rank = { ...fact, type: "rank" as const, value: 2, unit: "名", derivation: "computed" as const, specification: { ...fact.specification, scope: "完整比较集合", focus: "A", method: "rank(descending,competition)", series_unit: "万元", calculation_id: "calc-test" }, series: [{ label: "A", value: 50 }, { label: "B", value: 70 }] };
  const html = render({ ...progress, facts: [{ ...progress.facts[0], fact: rank }] });
  for (const text of ["排名", "确定性计算", "名次", "万元", "统计口径与方法", "完整比较集合"]) assert.ok(html.includes(text), text);
  const proportion = { ...rank, type: "proportion" as const, value: 35, unit: "%", derivation: "forecast" as const };
  assert.match(render({ ...progress, facts: [{ ...progress.facts[0], fact: proportion }] }), /占比 35%/);
  assert.match(render({ ...progress, facts: [{ ...progress.facts[0], fact: proportion }] }), /预测/);
});


test("mixed-unit fact previews keep raw observations without drawing a misleading shared axis", () => {
  const mixed = { ...fact, type: "distribution" as const, specification: { ...fact.specification, series_unit: "千、%" }, series: [{ label: "Count (千)", value: 10 }, { label: "Rate (%)", value: 20 }] };
  const html = render({ ...progress, facts: [{ ...progress.facts[0], fact: mixed }] });
  assert.match(html, /混合单位序列，暂不绘制同轴图表/);
  assert.match(html, /Count \(千\)/); assert.match(html, /Rate \(%\)/);
  assert.doesNotMatch(html, /<svg[^>]+viewBox="0 0 300 100"/);
  assert.match(html, />10</); assert.match(html, />20</);
});
