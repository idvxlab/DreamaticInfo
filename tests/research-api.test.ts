import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { spawn } from "node:child_process";
const root = await mkdtemp(path.join(os.tmpdir(), "info-research-api-"));
process.env.INFO_CONFIG_DIR = root;
const socket = net.createServer();
await new Promise<void>(resolve => socket.listen(0, "127.0.0.1", resolve));
const port = (socket.address() as net.AddressInfo).port;
await new Promise<void>(resolve => socket.close(() => resolve()));
await writeFile(path.join(root, ".env"), `PORT=${port}\n`);
const store = await import("../apps/server/src/store.js");
const { ResearchWorkbench } = await import("../apps/server/src/research-workbench.js");
const { fetchSource } = await import("../apps/server/src/network.js");
const p = await store.create("Intermediate API", "live");
const text = `<title>Official report</title><main>${"A documented result with scope and evidence. ".repeat(15)}</main>`;
const work = await ResearchWorkbench.open(p, { search: async () => [{ title: "Report", url: "https://data.example/report", description: "Candidate" }], fetch: (id, url, signal) => fetchSource(id, url, signal, async () => ({ text, url, contentType: "text/html", buffer: Buffer.from(text) })) });
await work.savePlan("## 调研目标\n核对公开数据并保留证据，足够时停止。\n\n## 搜索队列\n| 编号 | 问题 | 关键词 | 优先级 | 目标来源 |\n| --- | --- | --- | --- | --- |\n| Q1 | 统计 | official statistics | 1 | worldbank |");
await work.search("Q1");
const collected = await work.collect("https://data.example/report", "Q1");
const child = spawn(process.execPath, ["--import", "tsx", "apps/server/src/index.ts"], { cwd: process.cwd(), env: { ...process.env, INFO_CONFIG_DIR: root }, stdio: "ignore" });
const base = `http://127.0.0.1:${port}/api`;
try {
  await test("HTTP exposes plans, queue and safe text/raw source views before the final research report exists", { timeout: 20000 }, async () => {
    let ready = false;
    for (let n = 0; n < 100; n++) {
      try { ready = (await fetch(base + "/health", { signal: AbortSignal.timeout(500) })).ok; } catch {}
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(ready, true);
    const view = await (await fetch(`${base}/projects/${p.id}`)).json();
    assert.equal(view.research, undefined); assert.equal(view.research_progress.tasks[0].hits.length, 1);
    assert.match(await (await fetch(`${base}/projects/${p.id}/research/plan`)).text(), /official statistics/);
    for (const format of ["text", "raw"]) {
      const response = await fetch(`${base}/projects/${p.id}/research/sources/${collected.entry.id}/${format}`);
      assert.equal(response.status, 200); assert.match(response.headers.get("content-type")!, /text\/plain/);
      assert.match(await response.text(), /documented result/);
    }
    assert.equal((await fetch(`${base}/projects/${p.id}/research/sources/not-present/raw`)).status, 404);
    assert.equal((await fetch(`${base}/projects/${p.id}/research/sources/${collected.entry.id}/html`)).status, 404);
  });
  await test("HTTP budget grants require valid amounts and preserve usage without starting the task", async () => {
    const { hash } = await import("../apps/server/src/validation.js");
    const current = await store.get(p.id);
    const scope = hash({ brief: current.brief, messages: current.messages.filter(m => m.role === "user"), uploads: current.uploads.map(u => u.sha256) });
    await store.atomic(path.join(store.projectDir(p.id), "state/run-usage.json"), JSON.stringify({ scope, counts: { model: 120, repair: 2, reported_cost_usd: 0.98 } }));
    const post = (amount: unknown) => fetch(`${base}/projects/${p.id}/model-budget`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount }) });
    assert.equal((await post(0)).status, 400);
    assert.equal((await post("40")).status, 400);
    const response = await post(40);
    assert.equal(response.status, 200);
    const view = await response.json();
    assert.equal(view.state.execution_budget.model, 120);
    assert.equal(view.state.execution_budget.model_task_limit, 160);
    assert.equal(view.state.execution_budget.repair, 2);
    assert.equal(view.state.execution_budget.reported_cost_usd, 0.98);
    assert.equal(view.state.status, current.state.status);
    assert.equal(view.state.stages.chatbot.attempts, current.state.stages.chatbot.attempts);
  });
} finally {
  if (child.exitCode === null && child.signalCode === null) { child.kill("SIGTERM"); await new Promise(resolve => child.once("exit", resolve)); }
  await rm(root, { recursive: true, force: true });
}
