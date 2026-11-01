import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
const root = await mkdtemp(path.join(os.tmpdir(), "info-markdown-"));
process.env.INFO_CONFIG_DIR = root;
const { renderDocument, parseDocument, documentTemplate } = await import("../apps/server/src/markdown-protocol.js");
const { SubmissionPolicy } = await import("../apps/server/src/submission-policy.js");
const store = await import("../apps/server/src/store.js");
const { Orchestrator } = await import("../apps/server/src/orchestrator.js");
const { fixtureRunner } = await import("./fixtures/workflow-runner.js");
const { getModels } = await import("../apps/server/src/pi.js");
const { roles } = await import("../packages/shared/types.js");
const { names } = await import("../apps/server/src/validation.js");
try {
  await test("five Markdown reports retain all facts, evidence, series, layout and mapping fields without JSON blocks", async () => {
    const p = await store.create("Markdown roundtrip", "live");
    const fixture = await readFile("tests/fixtures/reading.csv");
    const { ingest } = await import("../apps/server/src/ingest.js");
    await ingest(p, "reading.csv", fixture);
    await new Orchestrator(fixtureRunner).start(p.id);
    const finished = await store.get(p.id);
    assert.equal(finished.state.status, "completed", finished.state.error || "");
    for (const role of roles) {
      const artifact = await store.readArtifact(finished, role);
      assert.equal(artifact.protocol, "infographic-markdown-2026");
      const parsed = parseDocument(role, artifact.markdown);
      assert.deepEqual(parsed.data, role === "builder" ? { summary: artifact.data.summary } : artifact.data);
      assert.equal(parsed.notes, artifact.notes);
      assert.doesNotMatch(artifact.markdown, /```json|"source_ids"\s*:|"layout"\s*:/);
      const disk = await readFile(path.join(store.projectDir(p.id), `${names[role]}.md`), "utf8");
      assert.equal(disk, artifact.markdown);
    }
    const before = structuredClone(finished.state.stages);
    await new Orchestrator(fixtureRunner).start(p.id);
    assert.deepEqual((await store.get(p.id)).state.stages, before);
    const handoffs = await store.handoffDocuments(finished, "builder");
    assert.equal(handoffs.length, 4);
    assert.ok(handoffs.find(doc => doc.name === "datafacts.md")?.text.includes("数值序列"));
    // Editing the authored document invalidates that stage and its downstream.
    await writeFile(path.join(store.projectDir(p.id), "datafacts.md"), "# Changed by user");
    const engine = new Orchestrator(fixtureRunner);
    await engine.reconcile(finished, await getModels());
    assert.equal(finished.state.stages.chatbot.status, "completed");
    assert.equal(finished.state.stages.analyst.status, "pending");
    const retained = (await store.detail(finished)).retained_documents;
    assert.ok(retained?.includes("datafacts.md"));
    assert.ok(!retained?.includes("intent.md"));
  });
  await test("Markdown table escaping preserves pipes, quotes, HTML, line breaks, empty strings and numeric text", () => {
    const data = { title: 'A | B <br> &amp; `quote`', topic: "first\nsecond\r", objective: " \t\\| original \t", audience: "", scope: "### Not a heading", data_requirements: "<script>data</script>", story_direction: "A &#10; B", visual_preferences: "未提供", constraints: ["", "A | B", "C\nD"] };
    const text = renderDocument("chatbot", data, "### Explanation\n\n- Keep this narrative.\n\n```text\nExample\n```");
    assert.deepEqual(parseDocument("chatbot", text).data, data);
    assert.match(parseDocument("chatbot", text).notes, /### Explanation/);
    const facts = parseDocument("analyst", documentTemplate("analyst")).data;
    facts.facts[0].value = "001";
    facts.facts[0].series = [{ label: "A | B", value: -2.5 }, { label: "", value: 0 }];
    facts.facts[0].relations = [];
    const parsed = parseDocument("analyst", renderDocument("analyst", facts)).data;
    assert.equal(parsed.facts[0].value, "001");
    assert.deepEqual(parsed.facts[0].series, facts.facts[0].series);
  });
  await test("Markdown reports reject missing/duplicate fields, bad numbers, misaligned tables and unknown sections", () => {
    const template = documentTemplate("chatbot");
    assert.throws(() => parseDocument("chatbot", template.replace(/\| 目标受众 .*\n/, "")), /目标受众/);
    assert.throws(() => parseDocument("chatbot", template.replace("| 主题 |", "| 标题 |")), /重复/);
    assert.throws(() => parseDocument("chatbot", template.replace("| --- | --- |", "| bad | separator |")), /分隔行/);
    assert.throws(() => parseDocument("chatbot", template.replace("| 主题 |", "| 未知字段 |")), /未知/);
    assert.throws(() => parseDocument("chatbot", "```json\n{}\n```"), /代码围栏/);
    assert.throws(() => parseDocument("designer", documentTemplate("designer").replace("| 宽度 | 0 |", "| 宽度 | NaN |")), /有限数值/);
  });
  await test("standalone Markdown thematic breaks do not invalidate facts or mutate cells and literal list values", () => {
    const data = parseDocument("analyst", documentTemplate("analyst")).data;
    data.facts[0].id = "F-001";
    data.facts.push({ ...structuredClone(data.facts[0]), id: "F-002" });
    data.facts[0].specification.method = "---";
    data.facts[0].evidence[0].quote = "before --- after";
    const markdown = renderDocument("analyst", data, "Keep notes\n\n---\n\nAfter notes");
    for (const separator of ["---", "***", "___", "  ---  "]) {
      const decorated = markdown.replace(/\n### 条目/g, `\n${separator}\n\n### 条目`).replace(/\n## 说明/, `\n${separator}\n\n## 说明`);
      assert.deepEqual(parseDocument("analyst", decorated).data, data);
      assert.equal(parseDocument("analyst", decorated).markdown, decorated);
      assert.match(parseDocument("analyst", decorated).notes, /---/);
    }
    const intent = parseDocument("chatbot", documentTemplate("chatbot")).data;
    intent.constraints = ["---", "***", "___", "- - -"];
    assert.deepEqual(parseDocument("chatbot", renderDocument("chatbot", intent)).data.constraints, intent.constraints);
    assert.throws(() => parseDocument("analyst", markdown.replace("### 条目 2", "unstructured prose\n\n### 条目 2")), /正文说明/);
    assert.throws(() => parseDocument("analyst", markdown.replace("| --- | --- |", "| broken | header |")), /分隔行/);
  });
  await test("single Markdown none marker is empty only in reference lists; mixed markers remain explicit errors", () => {
    const design = parseDocument("designer", documentTemplate("designer")).data;
    design.components[0].fact_ids = ["无"]; design.components[0].story_ids = ["无"];
    const markdown = renderDocument("designer", design);
    const parsed = parseDocument("designer", markdown);
    assert.deepEqual(parsed.data.components[0].fact_ids, []);
    assert.deepEqual(parsed.data.components[0].story_ids, []);
    assert.equal(parsed.markdown, markdown);
    design.components[0].fact_ids = ["无", "F-real"];
    assert.throws(() => parseDocument("designer", renderDocument("designer", design)), /不能与真实编号混写/);
    const intent = parseDocument("chatbot", documentTemplate("chatbot")).data;
    intent.constraints = ["无"];
    assert.deepEqual(parseDocument("chatbot", renderDocument("chatbot", intent)).data.constraints, ["无"]);
  });
  await test("submission failures use saved limits and stop repeated or varying errors", async () => {
    const repeated = new SubmissionPolicy();
    repeated.reject(new Error("Missing evidence")); repeated.reject(new Error("Missing evidence"));
    assert.equal(repeated.fatal, undefined);
    repeated.reject(new Error("Missing evidence")); assert.match(repeated.fatal!.message, /阶段已停止/);
    const varied = new SubmissionPolicy();
    for (let n = 0; n < 5; n++) varied.reject(new Error(`field-${n}`));
    assert.match(varied.fatal!.message, /共 5 次/);
    const { saveRuntimeConfig } = await import("../apps/server/src/config-store.js");
    await saveRuntimeConfig({ values: { DREAMATIC_MAX_REPEATED_SUBMISSIONS: "1", DREAMATIC_MAX_INVALID_SUBMISSIONS: "2" } });
    const configured = new SubmissionPolicy();
    configured.reject(new Error("503 in document content is not a network failure"));
    assert.match(configured.fatal!.message, /共 1 次/);
    const failed = await store.create("Permanent document failure", "live");
    await new Orchestrator(async () => { throw configured.fatal!; }).start(failed.id);
    assert.equal((await store.get(failed.id)).state.stages.chatbot.attempts, 1);
    await saveRuntimeConfig({ values: { DREAMATIC_MAX_REPEATED_SUBMISSIONS: "3", DREAMATIC_MAX_INVALID_SUBMISSIONS: "5" } });
  });
  await test("only current Markdown artifacts are accepted and narrative changes invalidate downstream", async () => {
    const p = await store.create("Markdown storage", "live"), models = await getModels();
    const intent = { title: "Markdown", topic: "Test", objective: "Objective", audience: "Public", scope: "Test", data_requirements: "CSV", story_direction: "Test", visual_preferences: "Neutral", constraints: [] };
    const engine = new Orchestrator(fixtureRunner);
    const document = renderDocument("chatbot", intent, "Notes");
    await store.commit(p, "chatbot", intent, "Notes", await engine.fingerprint(p, "chatbot", models), document);
    const before = await engine.fingerprint(p, "researcher", models);
    assert.equal((await store.handoffDocuments(p, "researcher"))[0].text, document);
    await assert.rejects(readFile(path.join(store.projectDir(p.id), "intent.json")), { code: "ENOENT" });
    await store.commit(p, "chatbot", intent, "New narrative", await engine.fingerprint(p, "chatbot", models), renderDocument("chatbot", intent, "New narrative"));
    assert.notEqual(await engine.fingerprint(p, "researcher", models), before);
    const version = p.state.stages.chatbot.version!;
    await writeFile(path.join(store.projectDir(p.id), "state/versions", version, "artifact.json"), JSON.stringify({ data: intent, notes: "Notes" }));
    await assert.rejects(store.readArtifact(p, "chatbot"), /必须使用当前 Markdown 协议/);
  });
} finally { await rm(root, { recursive: true, force: true }); }
