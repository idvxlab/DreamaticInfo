import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, stat, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { spawn } from "node:child_process";
const root = await mkdtemp(path.join(os.tmpdir(), "info-analysis-api-"));
process.env.INFO_CONFIG_DIR = root;
const socket = net.createServer();
await new Promise<void>(resolve => socket.listen(0, "127.0.0.1", resolve));
const port = (socket.address() as net.AddressInfo).port;
await new Promise<void>(resolve => socket.close(() => resolve()));
await writeFile(path.join(root, ".env"), `PORT=${port}\n`);
const store = await import("../apps/server/src/store.js");
const { Orchestrator } = await import("../apps/server/src/orchestrator.js");
const { fixtureRunner } = await import("./fixtures/workflow-runner.js");
const { ingest } = await import("../apps/server/src/ingest.js");
const { AnalystWorkbench } = await import("../apps/server/src/analyst-workbench.js");
const { renderDocument } = await import("../apps/server/src/markdown-protocol.js");
const p = await store.create("Facts intermediate fixture", "live");
await ingest(p, "reading.csv", await readFile("tests/fixtures/reading.csv"));
await new Orchestrator(async (...args) => { if (args[1] === "analyst") throw new Error("Fixture stop before analysis"); return fixtureRunner(...args); }).start(p.id);
const ready = await store.get(p.id), inputs = await store.upstream(ready, "analyst");
const work = await AnalystWorkbench.open(ready, inputs.research, inputs.intent);
const good = (await fixtureRunner(ready, "analyst", {} as any, { signal: new AbortController().signal, event: () => {} })).data;
const child = spawn(process.execPath, ["--import", "tsx", "apps/server/src/index.ts"], { cwd: process.cwd(), env: { ...process.env, INFO_CONFIG_DIR: root }, stdio: "ignore" });
const base = `http://127.0.0.1:${port}/api/projects/${p.id}`;
async function snapshot() {
  const directory = path.join(store.projectDir(p.id), "state/drafts");
  const files = await readdir(directory, { recursive: true });
  return Promise.all(files.sort().map(async file => [file, (await stat(path.join(directory, file))).mtimeMs]));
}
let revision = "";
try {
  await test("HTTP polling exposes saved draft facts and checks before formal completion without writing files", { timeout: 20000 }, async () => {
    let available = false;
    for (let i = 0; i < 100; i++) { try { available = (await fetch(`http://127.0.0.1:${port}/api/health`)).ok; } catch {} if (available) break; await new Promise(resolve => setTimeout(resolve, 100)); }
    assert.equal(available, true);
    assert.equal((await (await fetch(`${base}/analysis/progress`)).json()).status, "empty");
    const invalid = structuredClone(good); invalid.facts[0].evidence = invalid.facts[0].evidence.map((entry: any, index: number) => ({ ...entry, quote: index === 0 ? "A quote absent from all sources" : entry.quote }));
    await assert.rejects(work.saveDraft(renderDocument("analyst", invalid)));
    const before = await snapshot();
    const view = await (await fetch(base)).json();
    assert.equal(view.datafacts, undefined); assert.equal(view.analysis_progress.status, "draft");
    assert.deepEqual(view.analysis_progress.counts, { saved: 3, verified: 2, needs_revision: 1 });
    assert.ok(view.analysis_progress.facts[0].issues.some((issue: any) => issue.message.includes("引文不在")));
    assert.equal((await store.upstream(await store.get(p.id), "designer")).datafacts, undefined);
    revision = view.analysis_progress.revision;
    for (const format of ["draft", "validation"]) {
      const response = await fetch(`${base}/analysis/${format}?revision=${revision}`);
      assert.equal(response.status, 200); assert.match(response.headers.get("content-type")!, /text\/plain/);
      assert.match(await response.text(), /草稿/);
    }
    assert.equal((await fetch(`${base}/analysis/raw?revision=${revision}`)).status, 404);
    assert.equal((await fetch(`${base}/analysis/draft`)).status, 400);
    assert.deepEqual(await snapshot(), before);
  });
  await test("polling reflects local corrections, keeps paused drafts and exposes parse errors without promoting them", async () => {
    const single = renderDocument("analyst", { summary: "Patch", facts: [good.facts[0]] }).split("## 数据事实\n\n")[1].split("## 说明")[0];
    await work.patchFact(revision, good.facts[0].id, single);
    const updated = await (await fetch(base)).json();
    assert.deepEqual(updated.analysis_progress.counts, { saved: 3, verified: 3, needs_revision: 0 });
    assert.equal((await fetch(`${base}/analysis/draft?revision=${revision}`)).status, 404);
    revision = updated.analysis_progress.revision;
    ready.state.status = "interrupted"; ready.state.stages.analyst.status = "interrupted"; await store.save(ready);
    assert.equal((await (await fetch(base)).json()).analysis_progress.revision, revision);
    await assert.rejects(work.saveDraft("# Incomplete draft", revision));
    const broken = await (await fetch(base)).json(); revision = broken.analysis_progress.revision;
    assert.equal(broken.datafacts, undefined); assert.equal(broken.analysis_progress.facts.length, 0);
    assert.ok(broken.analysis_progress.issues.some((issue: any) => !issue.fact));
    assert.match(await (await fetch(`${base}/analysis/draft?revision=${revision}`)).text(), /Incomplete draft/);
    await work.saveDraft(renderDocument("analyst", good), revision);
  });
  await test("changed source content hides stale facts and formal commit replaces the draft projection", async () => {
    const file = path.join(store.projectDir(p.id), ready.uploads[0].path), original = await readFile(file);
    await writeFile(file, Buffer.concat([original, Buffer.from("\n")]));
    const stale = await (await fetch(base)).json();
    assert.equal(stale.analysis_progress.status, "stale"); assert.equal(stale.analysis_progress.facts.length, 0); assert.equal(stale.datafacts, undefined);
    await writeFile(file, original);
    const progress = await (await fetch(`${base}/analysis/progress`)).json();
    const parsed = await work.submit(undefined, progress.revision);
    await store.commit(ready, "analyst", parsed.data, parsed.notes, "fixture-input-hash", parsed.markdown);
    const complete = await (await fetch(base)).json();
    assert.equal(complete.analysis_progress, undefined); assert.equal(complete.datafacts.facts.length, 3);
    assert.equal((await (await fetch(`${base}/analysis/progress`)).json()), null);
    assert.equal((await store.upstream(await store.get(p.id), "designer")).datafacts.facts.length, 3);
  });
} finally {
  if (child.exitCode === null && child.signalCode === null) { child.kill("SIGTERM"); await new Promise(resolve => child.once("exit", resolve)); }
  await rm(root, { recursive: true, force: true });
}
