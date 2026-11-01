import { DesignerWorkbench, readDesignProgress } from "./designer-workbench.js";
import { AnalystWorkbench, readAnalysisProgress } from "./analyst-workbench.js";
import { readProgress, readableSource } from "./research-state.js";
import { parseDocument } from "./markdown-protocol.js";
import { renameProject, trashProject } from "./project-management.js";
import { policy } from "./policy.js";
import {
  setting,
  readRuntimeConfig,
  saveRuntimeConfig,
} from "./config-store.js";
import express from "express";
import multer from "multer";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { roles, type Role } from "../../../packages/shared/types.js";
import {
  create,
  detail,
  get,
  list,
  log,
  now,
  projectDir,
  readArtifact,
  safePath,
  save,
} from "./store.js";
import { ingest } from "./ingest.js";
import { getModels, runtime, resetRuntime } from "./pi.js";
import { emit, listeners, orchestrator } from "./orchestrator.js";
import { commit } from "./store.js";
import { validateReferences } from "./validation.js";
import { validateProvenance } from "./provenance.js";
import { upstream } from "./store.js";
import { exportPdf, previewCsp } from "./export.js";
// Configuration is initialized before constructing the server and project store.
const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  const host = (req.headers.host || "").split(":")[0];
  if (!["localhost", "127.0.0.1", "["].includes(host)) {
    res.status(403).json({ error: "仅支持本地访问" });
    return;
  }
  const origin = req.headers.origin;
  if (origin) {
    try {
      const u = new URL(origin);
      if (
        !["127.0.0.1", "localhost"].includes(u.hostname) ||
        ![setting("PORT"), setting("DREAMATIC_WEB_PORT")].includes(u.port)
      )
        throw new Error();
    } catch {
      res.status(403).json({ error: "Invalid Origin" });
      return;
    }
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});
app.use(express.json({ limit: "4mb" }));

function idle(id: string) {
  if (orchestrator.busy(id)) throw new Error("请暂停后修改项目");
}
app.get("/api/health", (_req, res) => res.json({ ok: true, pi: "1.4.0" }));
let configSaving = false;
app.get("/api/settings", (_req, res) => res.json(readRuntimeConfig()));
app.put("/api/settings", async (req, res) => {
  if (orchestrator.active.size || mutationLocks.size)
    throw new Error("请等待任务或导出完成后保存配置");
  if (configSaving) throw new Error("配置正在保存");
  configSaving = true;
  try {
    const result = await saveRuntimeConfig(req.body);
    resetRuntime();
    res.json(result);
  } finally {
    configSaving = false;
  }
});
const mutationLocks = new Set<string>();
app.use("/api/projects/:id", (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (configSaving) {
    res.status(409).json({ error: "配置正在保存，请稍后重试" });
    return;
  }
  const id = String(req.params.id);
  if (mutationLocks.has(id)) {
    res.status(409).json({ error: "项目正在保存或导出，请稍后重试" });
    return;
  }
  mutationLocks.add(id);
  const release = () => mutationLocks.delete(id);
  res.once("finish", release);
  res.once("close", release);
  next();
});
app.get("/api/projects", async (_req, res) => res.json(await list()));
app.post("/api/projects", async (req, res) => {
  const brief = typeof req.body.brief === "string" ? req.body.brief.trim() : "";
  if (brief.length > 50000) throw new Error("Brief 超过长度限制");
  if (req.body.mode !== undefined && req.body.mode !== "live")
    throw new Error("不支持示例模式，请创建新项目");
  const p = await create(brief, "live");
  res.status(201).json(await detail(p));
});
app.get("/api/projects/:id", async (req, res) =>
  res.json(await detail(await get(req.params.id))),
);
app.patch("/api/projects/:id/title", async (req, res) => {
  const result = await renameProject(String(req.params.id), req.body.title);
  res.json(result);
});
app.delete("/api/projects/:id", async (req, res) => {
  const id = String(req.params.id);
  idle(id);
  const result = await trashProject(id);
  emit(id, "项目已移至回收目录");
  res.json(result);
});
app.patch("/api/projects/:id", async (req, res) => {
  idle(req.params.id);
  const p = await get(req.params.id);
  if (
    typeof req.body.brief !== "string" ||
    !req.body.brief.trim() ||
    req.body.brief.length > 50000
  )
    throw new Error("Brief 无效");
  p.brief = req.body.brief.trim();
  p.messages.push({ role: "user", text: p.brief, at: now() });
  await save(p);
  await orchestrator.invalidate(p.id, "chatbot");
  await log(p.id, "Brief updated; downstream invalidated");
  res.json(await detail(await get(p.id)));
});
app.post(
  "/api/projects/:id/uploads",
  (req, res, next) =>
    multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: policy.upload_limit_mb * 1024 * 1024, files: 8 },
    }).array("files", 8)(req, res, next),
  async (req, res) => {
    idle(String(req.params.id));
    let p = await get(String(req.params.id));
    for (const file of req.files as Express.Multer.File[])
      await ingest(
        p,
        Buffer.from(file.originalname, "latin1").toString("utf8"),
        file.buffer,
      );
    await orchestrator.invalidate(p.id, "researcher");
    res.json(await detail(await get(p.id)));
  },
);
app.post("/api/projects/:id/messages", async (req, res) => {
  idle(req.params.id);
  const p = await get(req.params.id);
  if (
    typeof req.body.text !== "string" ||
    !req.body.text.trim() ||
    req.body.text.length > 50000
  )
    throw new Error("消息无效");
  p.messages.push({ role: "user", text: req.body.text.trim(), at: now() });
  if (!p.brief.trim()) p.title = req.body.text.trim().slice(0, 32);
  p.brief = p.brief.trim()
    ? `${p.brief}\n补充：${req.body.text.trim()}`
    : req.body.text.trim();
  await save(p);
  await orchestrator.invalidate(p.id, "chatbot");
  void orchestrator.start(p.id);
  res.json({ ok: true });
});
app.post("/api/projects/:id/run", async (req, res) => {
  const p = await get(req.params.id);
  if (!p.brief.trim() && p.mode === "live") throw new Error("请先描述项目需求");
  void orchestrator.start(p.id);
  res.status(202).json({ ok: true });
});
app.post("/api/projects/:id/pause", async (req, res) => {
  await get(req.params.id);
  await orchestrator.pause(req.params.id);
  res.json({ ok: true });
});
app.post("/api/projects/:id/rerun", async (req, res) => {
  idle(req.params.id);
  if (!roles.includes(req.body.role)) throw new Error("Invalid role");
  await orchestrator.invalidate(req.params.id, req.body.role as Role);
  void orchestrator.start(req.params.id);
  res.json({ ok: true });
});
app.get("/api/projects/:id/events", async (req, res) => {
  await get(req.params.id);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  const send = (event: unknown) =>
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  const set = listeners.get(req.params.id) || new Set();
  set.add(send);
  listeners.set(req.params.id, set);
  const interval = setInterval(() => res.write(": heartbeat\n\n"), 20000);
  req.on("close", () => {
    clearInterval(interval);
    set.delete(send);
    if (!set.size) listeners.delete(req.params.id);
  });
  send({ at: now(), text: "连接已建立" });
});
app.put("/api/projects/:id/artifact/:role", async (req, res) => {
  const id = String(req.params.id),
    role = String(req.params.role) as Role;
  idle(id);
  if (!roles.includes(role) || role === "builder")
    throw new Error("不支持的编辑阶段");
  const p = await get(id),
    models = await getModels();
  for (const before of roles.slice(0, roles.indexOf(role)))
    if (p.state.stages[before].status !== "completed")
      throw new Error("上游阶段尚未完成");
  const parsed = parseDocument(role, req.body.markdown);
  const data = parsed.data;
  const notes = parsed.notes;
  validateReferences(role, data, await upstream(p, role));
  await validateProvenance(p, role, data);
  await commit(
    p,
    role,
    data,
    notes,
    await orchestrator.fingerprint(p, role, models),
    parsed.markdown,
  );
  const nextRole = roles[roles.indexOf(role) + 1];
  if (nextRole) await orchestrator.invalidate(id, nextRole);
  await log(id, `user updated ${role}; downstream invalidated`);
  res.json(await detail(await get(id)));
});
app.get("/api/projects/:id/preview", async (req, res) => {
  const p = await get(req.params.id),
    a = await readArtifact(p, "builder");
  if (!a) {
    res.status(404).send("尚无作品");
    return;
  }
  res.setHeader(
    "Content-Security-Policy",
    `sandbox allow-scripts; ${previewCsp}`,
  );
  res.type("html").send(a.data.html);
});
app.get("/api/projects/:id/html", async (req, res) => {
  const a = await readArtifact(await get(req.params.id), "builder");
  if (!a) throw new Error("尚无作品");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="dreamatic-info.html"',
  );
  res.type("html").send(a.data.html);
});
app.post("/api/projects/:id/pdf", async (req, res) => {
  idle(req.params.id);
  const p = await get(req.params.id);
  const file = await exportPdf(p);
  emit(p.id, "PDF 海报已导出");
  res.download(file, "dreamatic-info.pdf");
});
// Retained canonical reports are read-only historical material, never workflow inputs.
app.get("/api/projects/:id/retained-document/:name", async (req, res) => {
  const p = await get(req.params.id);
  const allowed = ["intent.md", "research.md", "datafacts.md", "design.md", "delivery.md"];
  if (!allowed.includes(req.params.name)) throw new Error("不支持的文档");
  const file = await safePath(projectDir(p.id), req.params.name);
  res.setHeader("Cache-Control", "no-store");
  res.type("text").send("# Retained document snapshot\n\nThis saved report may predate the current requirements or role contract. It is not a valid input to the active workflow.\n\n" + await readFile(file, "utf8"));
});
app.get("/api/projects/:id/document/:name", async (req, res) => {
  const p = await get(req.params.id);
  const allowed = ["intent", "research", "datafacts", "design", "delivery"];
  const ext = path.extname(req.params.name);
  if (
    ext !== ".md" ||
    !allowed.includes(path.basename(req.params.name, ext))
  )
    throw new Error("不支持的文档");
  const role = roles[allowed.indexOf(path.basename(req.params.name, ext))];
  if (!p.state.stages[role].version) throw new Error("该阶段尚无有效产物");
  const file = await safePath(projectDir(p.id), req.params.name);
  res
    .type("text")
    .send(await readFile(file, "utf8"));
});
app.get("/api/projects/:id/analysis/:format", async (req, res) => {
  const p = await get(req.params.id), inputs = await upstream(p, "analyst");
  if (req.params.format === "progress") { res.json(await readAnalysisProgress(p, inputs.research, inputs.intent) ?? null); return; }
  if (!["draft", "validation"].includes(req.params.format) || !inputs.research || p.state.stages.researcher.status !== "completed") { res.status(404).json({ error: "草稿不存在" }); return; }
  const revision = req.query.revision;
  if (typeof revision !== "string" || !/^[a-f0-9-]{36}$/.test(revision)) { res.status(400).json({ error: "请提供当前草稿版本" }); return; }
  try {
    const work = await AnalystWorkbench.open(p, inputs.research, inputs.intent, { readOnly: true });
    const text = await work.document(req.params.format as "draft" | "validation", revision);
    if (text === undefined) { res.status(404).json({ error: "草稿版本已变化或已失效，请刷新页面" }); return; }
    res.type("text").send(req.params.format === "draft" ? `# 分析草稿（尚未正式提交）\n\n${text}` : text);
  } catch { res.status(409).json({ error: "草稿无法核验或资料已变化，请刷新页面" }); }
});
app.get("/api/projects/:id/design/:format", async (req, res) => {
  const p = await get(req.params.id), inputs = await upstream(p, "designer");
  if (req.params.format === "progress") { res.json(await readDesignProgress(p, inputs) ?? null); return; }
  if (!["draft", "validation"].includes(req.params.format) || !inputs.datafacts || p.state.stages.analyst.status !== "completed" || p.state.stages.designer.status === "completed") { res.status(404).json({ error: "当前没有未提交的设计草稿" }); return; }
  const revision = req.query.revision;
  if (typeof revision !== "string" || !/^[a-f0-9-]{36}$/.test(revision)) { res.status(400).json({ error: "请提供当前设计草稿版本" }); return; }
  try {
    const text = await (await DesignerWorkbench.open(p, inputs)).document(req.params.format as "draft" | "validation", revision);
    if (text === undefined) { res.status(404).json({ error: "设计草稿版本已变化或已失效" }); return; }
    res.type("text").send(req.params.format === "draft" ? `# 叙事设计草稿（尚未正式提交）\n\n${text}` : text);
  } catch { res.status(409).json({ error: "设计草稿无法核验或资料已变化" }); }
});
app.get("/api/projects/:id/research/plan", async (req, res) => {
  const progress = await readProgress(await get(req.params.id));
  if (!progress?.plan_markdown) { res.status(404).json({ error: "尚无搜索计划" }); return; }
  res.type("text").send(progress.plan_markdown);
});
app.get("/api/projects/:id/research/sources/:sourceId/:format", async (req, res) => {
  const p = await get(req.params.id), progress = await readProgress(p);
  const source = progress?.sources.find(item => item.id === req.params.sourceId);
  if (!source || !["text", "raw", "rendered"].includes(req.params.format)) { res.status(404).json({ error: "资料不存在" }); return; }
  if (req.params.format === "text" && source.status === "accepted") { res.type("text").send(await readableSource(p, source)); return; }
  const file = req.params.format === "raw" ? source.raw_path : req.params.format === "rendered" ? source.rendered_path : source.source?.path;
  if (!file) { res.status(404).json({ error: "尚未取得响应内容" }); return; }
  res.type("text").send(await readFile(await safePath(projectDir(p.id), file), "utf8"));
});
app.get("/api/projects/:id/source/:sourceId", async (req, res) => {
  const p = await get(req.params.id),
    research = await readArtifact(p, "researcher");
  const s = research?.data.sources.find(
    (x: any) => x.id === req.params.sourceId,
  );
  if (!s) throw new Error("来源不可用");
  res
    .type("text")
    .send(await readFile(await safePath(projectDir(p.id), s.path), "utf8"));
});
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "API not found" }),
);
app.use(express.static(path.resolve("dist/web")));
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const message =
      err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
        ? `文件超过配置的上传上限（${policy.upload_limit_mb}MB）`
        : err.message;
    console.error(message);
    res.status(400).json({ error: message });
  },
);
await orchestrator.recover();
const server = app.listen(Number(setting("PORT")), "127.0.0.1", () =>
  console.log(`Dreamatic · Info API http://127.0.0.1:${setting("PORT")}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    void Promise.all(
      [...orchestrator.active.keys()].map((id) => orchestrator.pause(id, "shutdown")),
    ).finally(() => {
      server.close();
      process.exit(0);
    });
  });
