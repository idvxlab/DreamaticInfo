import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { OfficeParser } from "officeparser";
const testRoot = await mkdtemp(
  path.join(os.tmpdir(), "dreamatic-info-test-"),
);
process.env.INFO_CONFIG_DIR = testRoot;
const store = await import("../apps/server/src/store.js");
const { Orchestrator } = await import("../apps/server/src/orchestrator.js");
const { fixtureRunner } = await import("./fixtures/workflow-runner.js");
const { ingest } = await import("../apps/server/src/ingest.js");
const { getModels, runtime } = await import("../apps/server/src/pi.js");
const { validateProvenance } = await import("../apps/server/src/provenance.js");
const { validateReferences, validateHtml } =
  await import("../apps/server/src/validation.js");
const { publicAddress, publicGet } =
  await import("../apps/server/src/network.js");
const { exportPdf, browserOptions } =
  await import("../apps/server/src/export.js");
const { chromium } = await import("playwright");
const fixture = await readFile("tests/fixtures/reading.csv");
async function sample() {
  const p = await store.create("阅读参与数据演示", "live");
  await ingest(p, "reading.csv", fixture);
  return p;
}
try {
  await test("Pi 1.4.0 public model runtime and native Skill discovery", async () => {
    const rt = await runtime();
    assert.ok(rt.getModel("openai", "gpt-5.4"));
    const { DefaultResourceLoader, SettingsManager } =
      await import("@earendil-works/pi-coding-agent");
    const cwd = store.projectDir((await sample()).id);
    const loader = new DefaultResourceLoader({
      cwd,
      agentDir: path.join(cwd, "state/pi"),
      settingsManager: SettingsManager.inMemory(),
      noExtensions: true,
      noContextFiles: true,
      additionalSkillPaths: [
        path.resolve("skills/technical"),
        path.resolve("skills/artistic"),
      ],
    });
    await loader.reload();
    assert.ok(
      loader.getSkills().skills.some((s) => s.name === "information-design"),
    );
    assert.ok(loader.getSkills().skills.some((s) => s.name === "monet"));
  });
  await test("five stages persist validated Markdown outputs and skip completed work", async () => {
    const p = await sample(),
      engine = new Orchestrator(fixtureRunner);
    await engine.start(p.id);
    const after = await store.get(p.id);
    assert.equal(after.state.status, "completed");
    assert.equal(after.state.completed.length, 5);
    const facts = (await store.readArtifact(after, "analyst")).data;
    assert.equal(facts.facts[1].value, 145);
    assert.match(
      await readFile(path.join(store.projectDir(p.id), "datafacts.md"), "utf8"),
      /CSV 行/,
    );
    const view = await store.detail(after);
    for (const role of ["chatbot", "researcher", "analyst", "designer", "builder"] as const) {
      assert.equal(view.stage_results?.[role]?.notes, (await store.readArtifact(after, role)).notes);
    }
    const invalidated = structuredClone(after);
    invalidated.state.stages.analyst.status = "pending";
    assert.equal((await store.detail(invalidated)).stage_results?.analyst, undefined);
    const versions = after.state.stages;
    await engine.start(p.id);
    assert.deepEqual((await store.get(p.id)).state.stages, versions);
  });
  await test("pause saves completed upstream and resumes only unfinished stage", async () => {
    const p = await sample();
    let entered!: () => void;
    const ready = new Promise<void>((r) => (entered = r));
    const engine = new Orchestrator(async (...args) => {
      if (args[1] === "analyst") {
        entered();
        await new Promise((_, reject) =>
          args[3].signal.addEventListener(
            "abort",
            () => reject(args[3].signal.reason),
            { once: true },
          ),
        );
      }
      return fixtureRunner(...args);
    });
    await store.save(p);
    const run = engine.start(p.id);
    await ready;
    await engine.pause(p.id);
    await run;
    const paused = await store.get(p.id);
    assert.equal(paused.state.status, "interrupted");
    assert.equal(paused.state.error, "用户暂停任务");
    assert.equal(paused.state.stages.researcher.status, "completed");
    const version = paused.state.stages.researcher.version;
    await new Orchestrator(fixtureRunner).start(p.id);
    const resumed = await store.get(p.id);
    assert.equal(resumed.state.status, "completed");
    assert.equal(resumed.state.stages.researcher.version, version);
  });
  await test("service shutdown records its actual cause and resume clears obsolete stage errors", async () => {
    const p = await sample();
    let entered!: () => void;
    const ready = new Promise<void>(resolve => { entered = resolve; });
    const engine = new Orchestrator(async (...args) => {
      entered();
      await new Promise((_, reject) => args[3].signal.addEventListener("abort", () => reject(args[3].signal.reason), { once: true }));
      return fixtureRunner(...args);
    });
    const run = engine.start(p.id); await ready;
    await engine.pause(p.id, "shutdown"); await run;
    const stopped = await store.get(p.id);
    assert.equal(stopped.state.status, "interrupted"); assert.match(stopped.state.error!, /服务停止/); assert.doesNotMatch(stopped.state.error!, /用户暂停/);
    assert.equal(stopped.state.stages.chatbot.attempts, 1);
    await new Orchestrator(async (...args) => {
      const current = await store.get(p.id);
      assert.equal(current.state.stages[args[1]].error, undefined);
      return fixtureRunner(...args);
    }).start(p.id);
    const resumed = await store.get(p.id);
    assert.equal(resumed.state.status, "completed"); assert.equal(resumed.state.stages.chatbot.attempts, 2);
  });
  await test("modified upstream Markdown invalidates affected stages", async () => {
    const p = await sample(),
      engine = new Orchestrator(fixtureRunner);
    await engine.start(p.id);
    const before = await store.get(p.id);
    await writeFile(path.join(store.projectDir(p.id), "datafacts.md"), "# Changed document");
    await engine.start(p.id);
    const after = await store.get(p.id);
    assert.equal(
      after.state.stages.researcher.version,
      before.state.stages.researcher.version,
    );
    assert.notEqual(
      after.state.stages.analyst.version,
      before.state.stages.analyst.version,
    );
    assert.notEqual(
      after.state.stages.builder.version,
      before.state.stages.builder.version,
    );
  });
  await test("changed model invalidates its own stage and downstream only", async () => {
    const p = await sample(),
      engine = new Orchestrator(fixtureRunner);
    await engine.start(p.id);
    const state = await store.get(p.id),
      models = await getModels();
    const analyst = state.state.stages.analyst.version;
    models.designer = { ...models.designer, thinkingLevel: "low" };
    await engine.reconcile(state, models);
    assert.equal(state.state.stages.analyst.version, analyst);
    assert.equal(state.state.stages.designer.status, "pending");
    assert.equal(state.state.stages.builder.status, "pending");
  });
  await test("changed upload invalidates research onward without redoing ChatBot", async () => {
    const p = await sample(),
      engine = new Orchestrator(fixtureRunner);
    await engine.start(p.id);
    const state = await store.get(p.id);
    await writeFile(
      path.join(store.projectDir(p.id), state.uploads[0].normalized),
      "changed data",
    );
    await engine.reconcile(state, await getModels());
    assert.equal(state.state.stages.chatbot.status, "completed");
    assert.equal(state.state.stages.researcher.status, "pending");
  });
  await test("startup recovers running stages as interrupted", async () => {
    const p = await sample();
    p.state.status = "running";
    p.state.current_stage = "chatbot";
    p.state.stages.chatbot.status = "running";
    await store.save(p);
    await new Orchestrator(fixtureRunner).recover();
    assert.equal((await store.get(p.id)).state.status, "interrupted");
  });
  await test("invalid references and dependencies rejected", async () => {
    const p = await sample(),
      engine = new Orchestrator(fixtureRunner);
    await engine.start(p.id);
    const state = await store.get(p.id),
      facts = (await store.readArtifact(state, "analyst")).data,
      design = (await store.readArtifact(state, "designer")).data;
    facts.facts[0].source_ids = ["invented"];
    const research = (await store.readArtifact(state, "researcher")).data;
    assert.throws(() => validateReferences("analyst", facts, { research }));
    const invalid = structuredClone(design);
    invalid.components[0].fact_ids = ["invented"];
    assert.throws(() =>
      validateReferences("designer", invalid, { datafacts: { facts: [] } }),
    );
    assert.throws(() =>
      validateHtml(
        '<html><title>test</title><body><script src="https://bad.test/x.js"></script>bad</body></html>',
      ),
    );
  });
  await test("Designer distinguishes scalar units from the units of underlying chart series", async () => {
    const p = await sample(); await new Orchestrator(fixtureRunner).start(p.id);
    const current = await store.get(p.id), inputs = await store.upstream(current, "designer");
    const design = (await store.readArtifact(current, "designer")).data;
    const metric = structuredClone(design); metric.components.find((component: any) => component.id === "metric-2").mapping.unit = "人";
    assert.throws(() => validateReferences("designer", metric, inputs), /指标单位/);
    const chart = structuredClone(design); chart.components.find((component: any) => component.id === "chart").mapping.unit = "名";
    assert.throws(() => validateReferences("designer", chart, inputs), /序列单位/);
  });
  await test("fabricated quotations are rejected against the actual source", async () => {
    const p = await sample();
    await new Orchestrator(fixtureRunner).start(p.id);
    const state = await store.get(p.id),
      facts = (await store.readArtifact(state, "analyst")).data;
    facts.facts[0].evidence[0].quote =
      "A fabricated quotation that is absent from the uploaded data";
    await assert.rejects(
      validateProvenance(state, "analyst", facts),
      /引文不在对应来源中/,
    );
  });
  await test("project read scope blocks traversal and symlink escape", async () => {
    const p = await sample(),
      root = store.projectDir(p.id);
    await assert.rejects(store.safePath(root, "../../package.json"));
    await symlink(
      path.resolve("package.json"),
      path.join(root, "input/escape"),
    );
    await assert.rejects(store.safePath(root, "input/escape"));
  });
  await test("network policy blocks loopback, mapped/private IPs and non-HTTPS", async () => {
    for (const ip of [
      "127.0.0.1",
      "10.0.0.1",
      "169.254.169.254",
      "::1",
      "::ffff:127.0.0.1",
    ])
      assert.equal(publicAddress(ip), false);
    assert.equal(publicAddress("8.8.8.8"), true);
    await assert.rejects(publicGet("http://example.com"));
    await assert.rejects(publicGet("https://127.0.0.1"));
  });
  await test("XLSX, DOCX and PDF imports preserve readable values; PDF export has valid header", async () => {
    const p = await sample(),
      wb = new ExcelJS.Workbook();
    wb.addWorksheet("阅读").addRows([
      ["year", "readers"],
      [2024, 294],
    ]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const x = await ingest(p, "阅读.xlsx", buf);
    assert.match(
      await readFile(path.join(store.projectDir(p.id), x.normalized), "utf8"),
      /294/,
    );
    const ast = await OfficeParser.parseOffice(
      Buffer.from("# Reading\n\nReaders: 294"),
      { fileType: "md" },
    );
    const doc = await ast.to("docx");
    const docx = await ingest(
      p,
      "reading.docx",
      Buffer.from(doc.value as Uint8Array),
    );
    assert.match(
      await readFile(
        path.join(store.projectDir(p.id), docx.normalized),
        "utf8",
      ),
      /294/,
    );
    await new Orchestrator(fixtureRunner).start(p.id);
    const pdf = await exportPdf(await store.get(p.id));
    assert.equal((await readFile(pdf)).subarray(0, 5).toString(), "%PDF-");
    const pp = await store.create("PDF ingestion", "live");
    const imp = await ingest(pp, "poster.pdf", await readFile(pdf));
    assert.match(
      await readFile(
        path.join(store.projectDir(pp.id), imp.normalized),
        "utf8",
      ),
      /294/,
    );
  });
} finally {
  await rm(testRoot, { recursive: true, force: true });
}
function awaitless(research: unknown) {
  return { research };
}
