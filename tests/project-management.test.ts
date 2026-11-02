import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  writeFile,
  readdir,
  rm,
  rename,
  mkdir,
  symlink,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
const config = await mkdtemp(path.join(os.tmpdir(), "info-projects-"));
process.env.INFO_CONFIG_DIR = config;
process.env.DREAMATIC_WORKSPACE = path.join(config, "configured-workspace");
const { renderDocument } = await import("../apps/server/src/markdown-protocol.js");
const store = await import("../apps/server/src/store.js");
const { renameProject, trashProject } =
  await import("../apps/server/src/project-management.js");
const { fixtureRunner } = await import("./fixtures/workflow-runner.js");
const { Orchestrator } = await import("../apps/server/src/orchestrator.js");
const { ingest } = await import("../apps/server/src/ingest.js");
try {
  await test("new draft is persisted and immediately listed in configured workspace without running models", async () => {
    const p = await store.create("", "live");
    assert.equal(p.title, "未命名项目");
    assert.equal(p.state.status, "pending");
    assert.deepEqual(p.messages, []);
    assert.ok((await store.list()).some((x) => x.id === p.id));
    assert.equal(store.ROOT, path.join(config, "configured-workspace"));
    const dir = store.projectDir(p.id);
    assert.equal(dir, path.join(store.ROOT, p.id));
    for (const name of [
      "input",
      "research",
      "analysis",
      "design",
      "assets",
      "output",
      "state",
    ])
      assert.ok((await readdir(dir)).includes(name));
    const saved = JSON.parse(
      await readFile(path.join(dir, "project.json"), "utf8"),
    );
    assert.equal(saved.id, p.id);
    assert.deepEqual(
      (await store.detail(await store.get(p.id))).state.completed,
      [],
    );
  });
  await test("custom title survives agent completion and does not invalidate generated outputs", async () => {
    const p = await store.create("阅读趋势", "live");
    await ingest(
      p,
      "reading.csv",
      await readFile("tests/fixtures/reading.csv"),
    );
    // Simulate an agent holding the old checkpoint while a user edits display metadata.
    const old = await store.get(p.id);
    await renameProject(p.id, " 我的阅读故事 ");
    const intent = { title: "AI generated title", topic: "阅读", objective: "分析变化", audience: "公众", scope: "测试数据", data_requirements: "CSV", story_direction: "趋势", visual_constraints: [], visual_preferences: "清晰", constraints: [] };
    await store.commit(
      old,
      "chatbot",
      intent,
      "fixture",
      "fixture",
      renderDocument("chatbot", intent, "fixture"),
    );
    assert.equal((await store.get(p.id)).title, "我的阅读故事");
    const engine = new Orchestrator(fixtureRunner);
    await engine.start(p.id);
    const after = await store.get(p.id);
    assert.equal(after.state.status, "completed");
    assert.equal(after.title, "我的阅读故事");
    const stages = structuredClone(after.state.stages);
    await renameProject(p.id, "新的自定义标题");
    await engine.start(p.id);
    const renamed = await store.get(p.id);
    assert.equal(renamed.title, "新的自定义标题");
    assert.deepEqual(renamed.state.stages, stages);
    assert.equal(
      (await store.list()).find((x) => x.id === p.id)?.title,
      "新的自定义标题",
    );
  });
  await test("invalid titles do not change display metadata", async () => {
    const p = await store.create("valid", "live");
    await renameProject(p.id, "valid name");
    const file = path.join(store.projectDir(p.id), "project-display.json"),
      before = await readFile(file, "utf8");
    for (const title of ["", "   ", "x".repeat(121), "line\nbreak", 123, null])
      await assert.rejects(renameProject(p.id, title));
    assert.equal(await readFile(file, "utf8"), before);
  });
  await test("deletion moves full project to local trash and can be restored on disk", async () => {
    const p = await store.create("retain source data", "live");
    await renameProject(p.id, "自定义名称");
    const file = path.join(store.projectDir(p.id), "input/original.txt");
    await writeFile(file, "original bytes");
    const before = await readFile(
        path.join(store.projectDir(p.id), "project.json"),
        "utf8",
      ),
      result = await trashProject(p.id);
    assert.ok(result.trashedPath.startsWith(".trash/"));
    assert.ok(!(await store.list()).some((x) => x.id === p.id));
    await assert.rejects(store.get(p.id));
    const trashed = path.join(store.ROOT, result.trashedPath);
    assert.equal(
      await readFile(path.join(trashed, "input/original.txt"), "utf8"),
      "original bytes",
    );
    assert.equal(
      await readFile(path.join(trashed, "project.json"), "utf8"),
      before,
    );
    await rename(trashed, store.projectDir(p.id));
    assert.equal((await store.get(p.id)).title, "自定义名称");
    assert.ok((await store.list()).some((x) => x.id === p.id));
  });
  await test("running projects cannot be deleted and unsafe IDs cannot leave workspace", async () => {
    const p = await store.create("running", "live");
    p.state.status = "running";
    p.state.stages.chatbot.status = "running";
    await store.save(p);
    await assert.rejects(trashProject(p.id), /暂停/);
    assert.equal((await store.get(p.id)).id, p.id);
    for (const id of ["../escape", "/tmp", "bad-id"]) {
      await assert.rejects(trashProject(id));
      await assert.rejects(renameProject(id, "name"));
    }
  });
  await test("symlink project directories cannot be renamed or moved", async () => {
    const outside = path.join(config, "outside");
    await mkdir(outside);
    await writeFile(path.join(outside, "marker"), "keep");
    const id = randomUUID();
    await symlink(outside, path.join(store.ROOT, id));
    await assert.rejects(renameProject(id, "wrong"), /目录无效/);
    await assert.rejects(trashProject(id), /目录无效/);
    assert.equal(await readFile(path.join(outside, "marker"), "utf8"), "keep");
  });
} finally {
  await rm(config, { recursive: true, force: true });
}
