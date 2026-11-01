import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
const root = await mkdtemp(path.join(os.tmpdir(), "info-markdown-session-"));
process.env.INFO_CONFIG_DIR = root;
const { saveRuntimeConfig } = await import("../apps/server/src/config-store.js");
const { piRunner, resetRuntime, getModels } = await import("../apps/server/src/pi.js");
const { renderDocument } = await import("../apps/server/src/markdown-protocol.js");
const store = await import("../apps/server/src/store.js");
const { Orchestrator } = await import("../apps/server/src/orchestrator.js");
const { fixtureRunner } = await import("./fixtures/workflow-runner.js");
const { ingest } = await import("../apps/server/src/ingest.js");
let actions: { name: string; arguments: unknown }[] = [], calls = 0;
let seen: any[] = [];
const server = http.createServer(async (req, res) => {
  let raw = ""; for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw); seen.push(body);
  const action = actions[Math.min(calls++, actions.length - 1)];
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  const chunk = (delta: unknown, finish_reason: string | null = null) => res.write(`data: ${JSON.stringify({ id: "markdown-fixture", object: "chat.completion.chunk", created: 1, model: "markdown-test", choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
  const argumentsValue = typeof action.arguments === "function" ? action.arguments(body) : action.arguments;
  chunk({ role: "assistant", tool_calls: [{ index: 0, id: `call-${calls}`, type: "function", function: { name: action.name, arguments: JSON.stringify(argumentsValue) } }] });
  chunk({}, "tool_calls"); res.end("data: [DONE]\n\n");
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
function scenario(next: typeof actions) { actions = next; calls = 0; seen = []; }
try {
  await saveRuntimeConfig({ values: { DREAMATIC_PROVIDER_TYPE: "openai-compatible", DREAMATIC_BASE_URL: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`, DREAMATIC_MODEL: "markdown-test", DREAMATIC_THINKING_LEVEL: "off" }, secrets: { DREAMATIC_API_KEY: "fixture" } });
  resetRuntime();
  const models = await getModels();
  const intent = { title: "Markdown", topic: "Test", objective: "Objective", audience: "Public", scope: "Test", data_requirements: "CSV", story_direction: "Story", visual_preferences: "Neutral", constraints: [] };
  await test("real Pi repairs a rejected Markdown report and exposes its outcome", { timeout: 15000 }, async () => {
    scenario([{ name: "submit_stage", arguments: { markdown: "# Missing fields" } }, { name: "submit_stage", arguments: { markdown: renderDocument("chatbot", intent, "Model explanation") } }]);
    const events: string[] = [];
    const project = await store.create("Session repair", "live");
    const result = await piRunner(project, "chatbot", models.chatbot, { signal: AbortSignal.timeout(10000), event: text => events.push(text) });
    assert.deepEqual(result.data, intent);
    const directory = path.join(store.projectDir(project.id), "state/sessions/chatbot");
    const sessionFile = (await readdir(directory)).find(file => file.endsWith(".jsonl"))!;
    const messages = (await readFile(path.join(directory, sessionFile), "utf8")).trim().split("\n").map(line => JSON.parse(line).message).filter(Boolean);
    assert.ok(messages.some(message => message.role === "toolResult" && message.toolName === "submit_stage" && JSON.stringify(message.content).includes("文档已接受")), "accepted tool result must survive the session stop");
    assert.ok(events.some(text => text.includes("文档提交未通过")));
    assert.ok(events.some(text => text.includes("文档校验通过")));
    const definition = seen[0].tools.find((item: any) => item.function.name === "submit_stage").function.parameters;
    assert.deepEqual(Object.keys(definition.properties), ["markdown"]);
    assert.equal(definition.properties.markdown.type, "string");
    assert.doesNotMatch(JSON.stringify(seen[0].messages.at(-1).content), /输出 JSON Schema|上游正式产物：/);
  });
  await test("real Pi stops repeated Markdown validation errors", { timeout: 15000 }, async () => {
    scenario([{ name: "submit_stage", arguments: { markdown: "# Missing fields" } }]);
    await assert.rejects(piRunner(await store.create("Invalid Markdown", "live"), "chatbot", models.chatbot, { signal: AbortSignal.timeout(10000), event: () => {} }), /阶段已停止：文档连续校验失败/);
    assert.ok(calls <= 4, `provider calls: ${calls}`);
  });
  await test("real Pi bounds old JSON arguments rejected before tool execution", { timeout: 15000 }, async () => {
    scenario([{ name: "submit_stage", arguments: { data: JSON.stringify(intent), notes: "old format" } }]);
    await assert.rejects(piRunner(await store.create("Legacy argument rejection", "live"), "chatbot", models.chatbot, { signal: AbortSignal.timeout(10000), event: () => {} }), /阶段已停止：文档连续校验失败/);
    assert.ok(calls <= 4, `provider calls: ${calls}`);
  });
  const p = await store.create("Full Markdown handoff", "live");
  await ingest(p, "reading.csv", await readFile("tests/fixtures/reading.csv"));
  await new Orchestrator(fixtureRunner).start(p.id);
  const ready = await store.get(p.id);
  await test("real Pi reads complete Markdown on demand and submits traceable research", { timeout: 15000 }, async () => {
    const research = await store.readArtifact(ready, "researcher");
    scenario([{ name: "read_handoff", arguments: { document: "intent.md" } }, { name: "save_search_plan", arguments: { markdown: "# 搜索计划\n\n## 调研目标\n使用已上传 CSV，完成字段核对后停止，无需网络搜索。\n\n## 搜索队列\n无" } }, { name: "submit_stage", arguments: { markdown: research.markdown } }]);
    const result = await piRunner(ready, "researcher", models.researcher, { signal: AbortSignal.timeout(10000), event: () => {} });
    assert.deepEqual(result.data, research.data);
    const reply = seen[1].messages.find((message: any) => message.role === "tool");
    assert.match(reply.content, /目标受众/);
    assert.match(reply.content, /字段/);
  });
  await test("real Pi repairs and resumes a persisted Analyst draft with source evidence and revision-only submission", { timeout: 15000 }, async () => {
    const artifact = await store.readArtifact(ready, "analyst"), good = artifact.data;
    const invalid = structuredClone(good); invalid.facts[0].evidence[0].quote = "not in source";
    const factSection = renderDocument("analyst", { summary: good.summary, facts: [good.facts[0]] }).split("## 数据事实\n\n")[1].split("## 说明")[0];
    const currentRevision = (body: any) => {
      const matches = [...JSON.stringify(body.messages).matchAll(/草稿版本：([a-f0-9-]{36})/g)];
      assert.ok(matches.length); return matches.at(-1)![1];
    };
    scenario([
      { name: "read_source_catalog", arguments: {} },
      { name: "read_evidence", arguments: { source_id: good.facts[0].source_ids[0], query: "2024" } },
      { name: "save_analysis_draft", arguments: { markdown: renderDocument("analyst", invalid) } },
      { name: "read_analysis_draft", arguments: { fact_id: good.facts[0].id } },
      { name: "patch_analysis_fact", arguments: (body: any) => ({ revision: currentRevision(body), fact_id: good.facts[0].id, markdown: factSection }) },
      { name: "submit_stage", arguments: (body: any) => ({ draft_revision: currentRevision(body) }) },
    ]);
    const result = await piRunner(ready, "analyst", models.analyst, { signal: AbortSignal.timeout(10000), event: () => {} });
    assert.deepEqual(result.data, good);
    assert.match(JSON.stringify(seen), /E-[a-f0-9]{16}/);
    assert.match(JSON.stringify(seen), /not in source/);
    assert.match(JSON.stringify(seen[0].messages), /来源目录/);
    assert.equal(calls, 6);
    const submission = seen[0].tools.find((item: any) => item.function.name === "submit_stage").function.parameters;
    assert.ok(submission.properties.draft_revision); assert.ok(!(submission.required ?? []).includes("markdown"));
    scenario([{ name: "read_analysis_draft", arguments: {} }, { name: "submit_stage", arguments: (body: any) => ({ draft_revision: currentRevision(body) }) }]);
    const resumed = await piRunner(ready, "analyst", models.analyst, { signal: AbortSignal.timeout(10000), event: () => {} });
    assert.deepEqual(resumed.data, good); assert.match(JSON.stringify(seen[0].messages), /已通过的事实/);
    assert.equal((await store.readArtifact(ready, "analyst")).markdown, artifact.markdown);
  });
  await test("real Pi continues more than five partial repairs, separates preflight from submission, and resets failures on progress", { timeout: 25000 }, async () => {
    const q = await store.create("Repair progress fixture", "live");
    await ingest(q, "reading.csv", await readFile("tests/fixtures/reading.csv"));
    await new Orchestrator(fixtureRunner).start(q.id);
    const current = await store.get(q.id), artifact = await store.readArtifact(current, "analyst");
    const goodFacts = Array.from({ length: 8 }, (_, i) => {
      const fact = structuredClone(artifact.data.facts[0]);
      return { ...fact, id: `F-repair-${i}`, relations: [], evidence: [structuredClone(fact.evidence[0]), structuredClone(fact.evidence[0])] };
    });
    const badFacts = goodFacts.map(fact => ({ ...structuredClone(fact), evidence: fact.evidence.map((item: any) => ({ ...item, quote: "unverified test quote" })) }));
    const currentRevision = (body: any) => {
      const matches = [...JSON.stringify(body.messages).matchAll(/草稿版本：([a-f0-9-]{36})/g)];
      assert.ok(matches.length); return matches.at(-1)![1];
    };
    const patch = (fact: any) => ({ name: "patch_analysis_fact", arguments: (body: any) => ({ revision: currentRevision(body), fact_id: fact.id, markdown: renderDocument("analyst", { summary: "Fixture", facts: [fact] }).split("## 数据事实\n\n")[1].split("## 说明")[0] }) });
    const submit = { name: "submit_stage", arguments: (body: any) => ({ draft_revision: currentRevision(body) }) };
    const next: typeof actions = [{ name: "save_analysis_draft", arguments: { markdown: renderDocument("analyst", { summary: "Fixture", facts: badFacts }) } }];
    for (let i = 0; i < 8; i++) {
      const partial = structuredClone(badFacts[i]); partial.evidence[0] = goodFacts[i].evidence[0];
      next.push(patch(partial), submit);
    }
    next.push(...goodFacts.map(patch), submit);
    scenario(next);
    const events: string[] = [];
    const result = await piRunner(current, "analyst", models.analyst, { signal: AbortSignal.timeout(20000), event: text => events.push(text) });
    assert.deepEqual(result.data.facts, goodFacts);
    assert.equal(calls, next.length);
    assert.equal(events.filter(text => text.startsWith("文档提交未通过")).length, 8);
    assert.equal(events.filter(text => text.startsWith("工具执行失败")).length, 8);
    assert.ok(events.filter(text => text.includes("修复进展已保存")).length > 5);
    assert.equal(events.some(text => text.includes("阶段已停止")), false);
    assert.equal((await store.readArtifact(current, "analyst")).markdown, artifact.markdown);
  });
  await test("real Pi bounds repeated draft preflight without progress and malformed draft parameters independently", { timeout: 15000 }, async () => {
    const artifact = await store.readArtifact(ready, "analyst");
    const revision = (body: any) => [...JSON.stringify(body.messages).matchAll(/草稿版本：([a-f0-9-]{36})/g)].at(-1)![1];
    scenario([{ name: "save_analysis_draft", arguments: (body: any) => ({ markdown: "# Broken draft", base_revision: revision(body) }) }]);
    await assert.rejects(piRunner(ready, "analyst", models.analyst, { signal: AbortSignal.timeout(10000), event: () => {} }), /分析草稿连续无进展/);
    assert.ok(calls <= 4);
    scenario([{ name: "patch_analysis_fact", arguments: { fact_id: "bad" } }]);
    await assert.rejects(piRunner(ready, "analyst", models.analyst, { signal: AbortSignal.timeout(10000), event: () => {} }), /文档连续校验失败/);
    assert.ok(calls <= 4);
    assert.equal((await store.readArtifact(ready, "analyst")).markdown, artifact.markdown);
  });
  await test("real Pi computes from source cells and recreates verifiable records without accepting model-filled values", { timeout: 15000 }, async () => {
    const artifact = await store.readArtifact(ready, "analyst");
    const computed = artifact.data.facts.filter((fact: any) => fact.derivation === "computed");
    const block = computed[0].evidence[0].location.match(/E-[a-f0-9]{16}/)[0], sourceId = computed[0].source_ids[0];
    for (const fact of computed) await rm(path.join(store.projectDir(p.id), `state/calculations/${fact.specification.calculation_id}.json`));
    scenario([
      { name: "calculate", arguments: { operation: "sum", source_id: sourceId, block_id: block, values: [999] } },
      { name: "calculate", arguments: { operation: "change_percent", unit: "人", source_id: sourceId, block_id: block, label_column: 0, value_column: 1 } },
      { name: "calculate", arguments: { operation: "trend", unit: "人", source_id: sourceId, block_id: block, label_column: 0, value_column: 1 } },
      { name: "submit_stage", arguments: { markdown: artifact.markdown } },
    ]);
    const result = await piRunner(ready, "analyst", models.analyst, { signal: AbortSignal.timeout(10000), event: () => {} });
    assert.deepEqual(result.data, artifact.data);
    assert.match(JSON.stringify(seen), /不接收模型自填数值/);
    assert.match(JSON.stringify(seen), /可复算来源计算/);
    for (const fact of computed) assert.match(await readFile(path.join(store.projectDir(p.id), `state/calculations/${fact.specification.calculation_id}.json`), "utf8"), /source-calculation-v1/);
  });
  await test("real Pi saves narrative before visuals, patches and reorders stories, resumes and submits the design revision", { timeout: 15000 }, async () => {
    const artifact = await store.readArtifact(ready, "designer"), design = artifact.data;
    const rev = (body: any) => [...JSON.stringify(body.messages).matchAll(/草稿版本：([a-f0-9-]{36})/g)].at(-1)![1];
    const final = { ...structuredClone(design), narrative_rationale: "先观察逐年证据，再总结变化规模。", storyline: [...design.storyline].reverse() };
    const patched = { ...design.storyline[0], rationale: "在年度证据之后总结规模。" };
    final.storyline[1] = patched;
    const story = renderDocument("designer", { ...design, storyline: [patched] }).split("## 故事线\n\n")[1].split(/^## /m)[0];
    scenario([
      { name: "submit_stage", arguments: { markdown: renderDocument("designer", design) } },
      { name: "read_design_draft", arguments: {} },
      { name: "save_design_draft", arguments: { markdown: renderDocument("designer", { ...design, components: [] }) } },
      { name: "patch_design_story", arguments: (body: any) => ({ revision: rev(body), story_id: patched.id, markdown: story }) },
      { name: "reorder_design_stories", arguments: (body: any) => ({ revision: rev(body), story_ids: final.storyline.map((item: any) => item.id) }) },
      { name: "save_design_draft", arguments: (body: any) => ({ base_revision: rev(body), markdown: renderDocument("designer", final) }) },
      { name: "submit_stage", arguments: (body: any) => ({ draft_revision: rev(body) }) },
    ]);
    const events: string[] = [];
    const result = await piRunner(ready, "designer", models.designer, { signal: AbortSignal.timeout(10000), event: text => events.push(text) });
    assert.deepEqual(result.data, final); assert.equal(calls, 7);
    assert.equal(events.filter(text => text.includes("工具执行失败")).length, 1);
    assert.ok(events.some(text => text.includes("请先调用 save_design_draft")));
    scenario([{ name: "read_design_draft", arguments: {} }, { name: "submit_stage", arguments: (body: any) => ({ draft_revision: rev(body) }) }]);
    assert.deepEqual((await piRunner(ready, "designer", models.designer, { signal: AbortSignal.timeout(10000), event: () => {} })).data, final);
    assert.equal((await store.readArtifact(ready, "designer")).markdown, artifact.markdown);
  });
  await test("real Pi reads and patches one visual component, explains wrong tool use, and bounds malformed component calls", { timeout: 15000 }, async () => {
    const original = await store.readArtifact(ready, "designer"), data = original.data;
    const component = { ...structuredClone(data.components[0]), title: "Corrected visual heading" };
    const markdown = renderDocument("designer", { ...data, components: [component] }).split("## 组件\n\n")[1].split(/^## /m)[0];
    const rev = (body: any) => [...JSON.stringify(body.messages).matchAll(/草稿版本：([a-f0-9-]{36})/g)].at(-1)![1];
    scenario([
      { name: "read_design_draft", arguments: { component_id: component.id } },
      { name: "patch_design_story", arguments: (body: any) => ({ revision: rev(body), story_id: component.id, markdown }) },
      { name: "patch_design_component", arguments: (body: any) => ({ revision: rev(body), component_id: component.id, markdown }) },
      { name: "submit_stage", arguments: (body: any) => ({ draft_revision: rev(body) }) },
    ]);
    const events: string[] = [];
    const result = await piRunner(ready, "designer", models.designer, { signal: AbortSignal.timeout(10000), event: text => events.push(text) });
    assert.equal(result.data.components[0].title, component.title); assert.equal(calls, 4);
    assert.equal(events.filter(text => text.startsWith("工具执行失败")).length, 1);
    assert.ok(events.some(text => text.includes("改用 patch_design_component")));
    scenario([{ name: "patch_design_component", arguments: { component_id: component.id } }]);
    await assert.rejects(piRunner(ready, "designer", models.designer, { signal: AbortSignal.timeout(10000), event: () => {} }), /文档连续校验失败/);
    assert.ok(calls <= 4);
    assert.equal((await store.readArtifact(ready, "designer")).markdown, original.markdown);
  });
  await test("real Pi saves HTML separately from its Markdown delivery report", { timeout: 15000 }, async () => {
    const builder = await store.readArtifact(ready, "builder");
    scenario([{ name: "read_visualization_guide", arguments: {} }, { name: "save_html", arguments: { html: builder.data.html } }, { name: "submit_stage", arguments: { markdown: builder.markdown } }]);
    const result = await piRunner(ready, "builder", models.builder, { signal: AbortSignal.timeout(10000), event: () => {} });
    assert.deepEqual(result.data, builder.data);
    assert.ok(!result.markdown!.includes("<!doctype"));
    assert.equal((await readFile(path.join(store.projectDir(p.id), "output/index.html"), "utf8")), builder.data.html);
  });
} finally {
  server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  await rm(root, { recursive: true, force: true });
}
