import { composition } from "./fixtures/composition.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import DesignWorkbench from "../apps/web/src/DesignWorkbench.js";
import DesignVisualPlan from "../apps/web/src/DesignVisualPlan.js";
import type { Design, ProjectDetail } from "../packages/shared/types.js";
const design: Design = { composition, title: "Narrative under review", theme: "From facts to a story", narrative_rationale: "Trace the evidence before drawing conclusions", font: "system-ui", palette: ["#c9e46b"], page: { width: 960, height: 1200, background: "#f6f5f0" }, storyline: [{ id: "S-1", title: "<script>story title</script>", description: "An evidence-based opening", rationale: "Start with the scale", fact_ids: [] }], components: [], assets: [] };
const project: ProjectDetail = { id: "project-test", title: "Review fixture", brief: "Fixture", mode: "live", created_at: "2026-10-31T00:00:00Z", updated_at: "2026-10-31T00:00:00Z", uploads: [], messages: [], has_html: false, has_pdf: false, files: [], state: { project_id: "project-test", status: "running", current_stage: "designer", completed: ["chatbot", "researcher", "analyst"], pending: ["designer", "builder"], updated_at: "2026-10-31T00:00:00Z", last_success_at: null, error: null, stages: { chatbot: { status: "completed", attempts: 1 }, researcher: { status: "completed", attempts: 1 }, analyst: { status: "completed", attempts: 1 }, designer: { status: "running", attempts: 1 }, builder: { status: "pending", attempts: 0 } } }, datafacts: { summary: "Facts", facts: [] }, design_progress: { status: "draft", revision: "11111111-1111-1111-1111-111111111111", phase: "narrative", updated_at: "2026-10-31T00:00:00Z", design, issues: [{ location: "组件", message: "Must have visual components", fix: "Create the design" }], counts: { stories: 1, components: 0, selected_facts: 0, verified_stories: 1 }, message: "Draft" } };
test("narrative defaults to three task views and compact story content without exposing the entire evidence or issue stream", () => {
  const html = renderToStaticMarkup(createElement(DesignWorkbench, { project, onLocateFact: () => {} }));
  for (const label of ["叙事编排", "视觉方案", "检查", "当前叙事段落", "整体主线"]) assert.ok(html.includes(label));
  assert.match(html, /aria-selected="true"[^>]*>叙事编排/);
  assert.doesNotMatch(html, /role="dialog"|dw-check-table|dw-component-table|analysis-counts|design-rationale/);
  assert.match(html, /&lt;script&gt;story title&lt;\/script&gt;/); assert.doesNotMatch(html, /<script>/);
});
test("stale and malformed designs retain navigation and actionable document access without rendering old stories", () => {
  const stale = { ...project, design_progress: { ...project.design_progress!, status: "stale" as const, message: "Inputs changed", design: undefined } };
  const html = renderToStaticMarkup(createElement(DesignWorkbench, { project: stale, onLocateFact: () => {} }));
  assert.match(html, /旧设计草稿已失效/); assert.doesNotMatch(html, /story title|dw-story-detail/);
  const malformed = { ...project, design_progress: { ...project.design_progress!, design: undefined } };
  const broken = renderToStaticMarkup(createElement(DesignWorkbench, { project: malformed, onLocateFact: () => {} }));
  assert.match(broken, /草稿结构暂不可解析/); assert.match(broken, /查看 1 项待修问题/); assert.match(broken, /design\/draft\?revision=/);
});
test("visual plans do not draw invalid draft geometry and keep each multi-story component in one default group", () => {
  const second = { ...design.storyline[0], id: "S-2", title: "Second story" };
  const component = { id: "C-1", title: "Cross-story component", type: "heading" as const, description: "Fixture", fact_ids: [], story_ids: ["S-1", "S-2"], asset_ids: [], parent_id: null, layout: { x: 0, y: 0, width: 800, height: 150 }, mapping: { label_field: "", value_field: "", unit: "" }, interaction: { trigger: "", behavior: "" }, animation: { trigger: "", behavior: "" } };
  const plan = { ...design, storyline: [...design.storyline, second], components: [component] };
  const render = (current: Design) => renderToStaticMarkup(createElement(DesignVisualPlan, { design: current, issues: [], facts: [], group: "all", selected: null, prefix: "preview", onGroup: () => {}, onSelect: () => {}, onFacts: () => {}, onCheck: () => {} }));
  assert.equal((render(plan).match(/class="dw-component-select"/g) ?? []).length, 1);
  const invalid = render({ ...plan, page: { ...plan.page, width: -1 } });
  assert.match(invalid, /页面尺寸待修/); assert.doesNotMatch(invalid, /viewBox=/);
});
