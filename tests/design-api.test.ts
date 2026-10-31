import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, readdir, stat, rm } from "node:fs/promises";
import path from "node:path"; import os from "node:os"; import net from "node:net"; import { spawn } from "node:child_process";
const root = await mkdtemp(path.join(os.tmpdir(), "info-design-api-")); process.env.INFO_CONFIG_DIR = root;
const socket = net.createServer(); await new Promise<void>(resolve => socket.listen(0, "127.0.0.1", resolve));
const port = (socket.address() as net.AddressInfo).port; await new Promise<void>(resolve => socket.close(() => resolve()));
await writeFile(path.join(root, ".env"), `PORT=${port}\n`);
const store = await import("../apps/server/src/store.js");
const { Orchestrator } = await import("../apps/server/src/orchestrator.js");
const { fixtureRunner } = await import("./fixtures/workflow-runner.js");
const { ingest } = await import("../apps/server/src/ingest.js");
const { DesignerWorkbench } = await import("../apps/server/src/designer-workbench.js");
const { renderDocument } = await import("../apps/server/src/markdown-protocol.js");
const p = await store.create("Design API fixture", "live"); await ingest(p, "reading.csv", await readFile("tests/fixtures/reading.csv"));
await new Orchestrator(async (...args) => { if (args[1] === "designer") throw new Error("Fixture design pause"); return fixtureRunner(...args); }).start(p.id);
const ready = await store.get(p.id), inputs = await store.upstream(ready, "designer"), work = await DesignerWorkbench.open(ready, inputs);
const good = (await fixtureRunner(ready, "designer", {} as any, { signal: new AbortController().signal, event: () => {} })).data;
const child = spawn(process.execPath, ["--import", "tsx", "apps/server/src/index.ts"], { cwd: process.cwd(), env: { ...process.env, INFO_CONFIG_DIR: root }, stdio: "ignore" });
const base = `http://127.0.0.1:${port}/api/projects/${p.id}`;
try {
  await test("design progress polling is read-only and narrative-only drafts never become Builder inputs", { timeout: 15000 }, async () => {
    let up = false; for (let i = 0; i < 100; i++) { try { up = (await fetch(`http://127.0.0.1:${port}/api/health`)).ok; } catch {} if (up) break; await new Promise(resolve => setTimeout(resolve, 100)); } assert.ok(up);
    assert.equal((await (await fetch(`${base}/design/progress`)).json()).status, "empty");
    await work.saveDraft(renderDocument("designer", { ...good, components: [] }));
    const directory = path.join(store.projectDir(p.id), "state/drafts/designer"), files = (await readdir(directory, { recursive: true })).sort();
    const snapshot = () => Promise.all(files.map(async file => [file, (await stat(path.join(directory, file))).mtimeMs])); const before = await snapshot();
    const detail = await (await fetch(base)).json(); assert.equal(detail.design, undefined); assert.equal(detail.design_progress.counts.stories, 2);
    assert.equal(detail.design_progress.phase, "narrative");
    for (const format of ["draft", "validation"]) {
      const response = await fetch(`${base}/design/${format}?revision=${detail.design_progress.revision}`); assert.equal(response.status, 200); assert.match(response.headers.get("content-type")!, /text\/plain/);
    }
    assert.equal((await fetch(`${base}/design/draft`)).status, 400);
    assert.equal((await fetch(`${base}/design/raw?revision=${detail.design_progress.revision}`)).status, 404);
    assert.deepEqual(await snapshot(), before);
    assert.equal((await store.upstream(ready, "builder")).design, undefined);
  });
  await test("polling updates saved revisions and stale source scopes never expose old designs", async () => {
    const previous = (await work.progress()).revision!;
    await work.saveDraft(renderDocument("designer", good), previous);
    assert.equal((await fetch(`${base}/design/draft?revision=${previous}`)).status, 404);
    const detail = await (await fetch(base)).json(); assert.equal(detail.design_progress.phase, "ready");
    const file = path.join(store.projectDir(p.id), inputs.research.sources[0].path), original = await readFile(file);
    await writeFile(file, Buffer.concat([original, Buffer.from("\nChanged source")]));
    const stale = await (await fetch(base)).json(); assert.equal(stale.design_progress.status, "stale"); assert.equal(stale.design_progress.design, undefined);
    assert.equal((await fetch(`${base}/design/draft?revision=${detail.design_progress.revision}`)).status, 404);
    await writeFile(file, original);
  });
  await test("formal submission replaces draft projection and enables Builder handoff", async () => {
    const progress = await work.progress(), parsed = await work.submit(undefined, progress.revision);
    await store.commit(ready, "designer", parsed.data, parsed.notes, "fixture-hash", parsed.markdown);
    const detail = await (await fetch(base)).json(); assert.equal(detail.design_progress, undefined); assert.equal(detail.design.storyline.length, 2);
    assert.equal(await (await fetch(`${base}/design/progress`)).json(), null);
    assert.equal((await fetch(`${base}/design/draft?revision=${progress.revision}`)).status, 404);
    assert.deepEqual((await store.upstream(ready, "builder")).design, good);
  });
} finally {
  if (child.exitCode === null && child.signalCode === null) { child.kill("SIGTERM"); await new Promise(resolve => child.once("exit", resolve)); }
  await rm(root, { recursive: true, force: true });
}
