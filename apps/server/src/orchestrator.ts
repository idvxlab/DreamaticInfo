import { DOCUMENT_PROTOCOL } from "./markdown-protocol.js";
import { DocumentSubmissionError } from "./submission-policy.js";
import { CONFIG_FIELDS, setting, approvedSkillPaths } from "./config-store.js";
import { policy } from "./policy.js";
import path from "node:path";
import { readFile, rm } from "node:fs/promises";
import {
  roles,
  type Models,
  type Project,
  type Role,
} from "../../../packages/shared/types.js";
import {
  commit,
  get,
  list,
  log,
  materialize,
  now,
  projectDir,
  readArtifact,
  safePath,
  save,
  upstream,
  handoffDocuments,
} from "./store.js";
import { hash, names, validateReferences } from "./validation.js";
import { getModels, NeedsAnswer, piRunner, type Runner } from "./pi.js";
import { validateProvenance } from "./provenance.js";
export type Event = { at: string; text: string; role?: Role };
export const listeners = new Map<string, Set<(e: Event) => void>>();
export function emit(id: string, text: string, role?: Role) {
  for (const cb of listeners.get(id) || []) cb({ at: now(), text, role });
}
export class Orchestrator {
  active = new Map<
    string,
    { controller: AbortController; done: Promise<void> }
  >();
  constructor(private runner: Runner = piRunner) {}
  busy(id: string) {
    return this.active.has(id);
  }
  async recover() {
    for (const p of await list())
      if (p.state.status === "running") {
        p.state.status = "interrupted";
        for (const r of roles)
          if (p.state.stages[r].status === "running")
            p.state.stages[r].status = "interrupted";
        p.state.error = "进程中断，已有成果已保存，可继续执行";
        await save(p);
      }
  }
  async fingerprint(p: Project, role: Role, models: Models) {
    const uploads = [];
    for (const f of p.uploads) {
      const root = projectDir(p.id);
      uploads.push([
        f.id,
        hash((await readFile(await safePath(root, f.path))).toString("base64")),
        hash(await readFile(await safePath(root, f.normalized), "utf8")),
      ]);
    }
    return hash({
      brief: p.brief,
      messages: p.messages.filter((m) => m.role === "user"),
      uploads:
        role === "chatbot"
          ? p.uploads.map((u) => ({ id: u.id, name: u.name }))
          : uploads,
      upstream: await upstream(p, role),
      model: models[role],
      connection: hash(
        Object.fromEntries(
          CONFIG_FIELDS.filter((f) => {
            if (f.module === "image") return role === "builder";
            if (f.module !== "reasoning")
              return role === "researcher" && f.module === "search";
            const owner = roles.find((r) =>
              f.key.endsWith("_" + r.toUpperCase()),
            );
            return !owner || owner === role;
          }).map((f) => [f.key, setting(f.key)]),
        ),
      ),
      skill_paths: approvedSkillPaths(role),
      mode: p.mode,
      document_protocol: DOCUMENT_PROTOCOL,
      handoff_documents: (await handoffDocuments(p, role)).map(doc => [doc.name, hash(doc.text)]),
    });
  }
  async reconcile(p: Project, models: Models) {
    let invalid = false;
    for (const role of roles) {
      const s = p.state.stages[role];
      if (s.status !== "completed") invalid = true;
      if (!invalid) {
        try {
          const artifact = await readArtifact(p, role);
          if (
            !artifact ||
            hash(artifact) !== s.output_hash ||
            s.input_hash !== (await this.fingerprint(p, role, models))
          )
            invalid = true;
          if (!invalid) {
            validateReferences(role, artifact.data, await upstream(p, role));
            // Re-create missing canonical files, but detect changes to an existing view.
            for (const [rel, expected] of [
              [
                `${names[role]}.md`,
                artifact.markdown,
              ],
              ...(role === "builder"
                ? [["output/index.html", artifact.data.html]]
                : []),
            ] as [string, string][]) {
              try {
                if (
                  (await readFile(path.join(projectDir(p.id), rel), "utf8")) !==
                  expected
                )
                  invalid = true;
              } catch {
                await materialize(p, role, artifact);
              }
            }
          }
        } catch {
          invalid = true;
        }
      }
      if (invalid) {
        p.state.stages[role] = { status: "pending", attempts: s.attempts };
      }
    }
    p.state.completed = roles.filter(
      (r) => p.state.stages[r].status === "completed",
    );
    p.state.pending = roles.filter((r) => !p.state.completed.includes(r));
    if (invalid)
      await rm(path.join(projectDir(p.id), "output/poster.pdf"), {
        force: true,
      });
    await save(p);
  }
  start(id: string) {
    if (this.busy(id)) throw new Error("项目正在执行");
    const controller = new AbortController();
    const done = Promise.resolve()
      .then(() => this.execute(id, controller.signal))
      .finally(() => this.active.delete(id));
    this.active.set(id, { controller, done });
    return done;
  }
  async pause(id: string, cause: "user" | "shutdown" = "user") {
    const run = this.active.get(id);
    if (!run) return;
    run.controller.abort(new Error(cause === "shutdown" ? "服务停止，任务已中断，已有成果已保存，可继续执行" : "用户暂停任务"));
    await run.done;
  }
  private async execute(id: string, signal: AbortSignal) {
    const p = await get(id),
      models = await getModels();
    try {
      await this.reconcile(p, models);
      p.state.status = "running";
      p.state.error = null;
      await save(p);
      emit(id, "任务开始");
      for (const role of roles) {
        signal.throwIfAborted();
        if (p.state.stages[role].status === "completed") continue;
        p.state.current_stage = role;
        p.state.stages[role].status = "running";
        delete p.state.stages[role].error;
        p.state.stages[role].inputs = [
          ...p.uploads.flatMap((u) => [u.path, u.normalized]),
          ...roles
            .slice(0, roles.indexOf(role))
            .map((r) => `${names[r]}.md`),
        ];
        p.state.stages[role].outputs =
          role === "builder"
            ? ["output/index.html", "delivery.md"]
            : [`${names[role]}.md`];
        await save(p);
        const inputHash = await this.fingerprint(p, role, models);
        emit(id, `${role} 开始`, role);
        let result;
        for (let attempt = 0; attempt < policy.retries; attempt++) {
          signal.throwIfAborted();
          p.state.stages[role].attempts++;
          await save(p);
          try {
            const stageSignal = AbortSignal.any([
              signal,
              AbortSignal.timeout(policy.max_stage_minutes * 60 * 1000),
            ]);
            result = await this.runner(p, role, models[role], {
              signal: stageSignal,
              event: (text) => {
                emit(id, text, role);
                void log(id, text);
              },
            });
            signal.throwIfAborted();
            validateReferences(role, result.data, await upstream(p, role));
            await validateProvenance(p, role, result.data);
            break;
          } catch (e) {
            if (
              signal.aborted ||
              e instanceof NeedsAnswer ||
              e instanceof DocumentSubmissionError ||
              attempt === policy.retries - 1 ||
              !/429|503|502|ECONNRESET|ETIMEDOUT|fetch failed|temporar/i.test(
                String(e),
              )
            )
              throw e;
            emit(id, `${role} 遇到临时网络或限流错误，准备自动重试`, role);
            await new Promise<void>((resolve, reject) => {
              const cb = () => {
                clearTimeout(timer);
                reject(signal.reason);
              };
              const timer = setTimeout(
                () => {
                  signal.removeEventListener("abort", cb);
                  resolve();
                },
                1000 * 2 ** attempt,
              );
              signal.addEventListener("abort", cb, { once: true });
            });
          }
        }
        if (!result) throw new Error("No stage result");
        await commit(p, role, result.data, result.notes, inputHash, result.markdown);
        emit(id, `${role} 已完成`, role);
      }
      p.state.status = "completed";
      p.state.current_stage = null;
      p.state.error = null;
      p.messages.push({
        role: "assistant",
        text: "信息图已完成，可查看事实、设计与作品，并导出 HTML 或 PDF。",
        at: now(),
      });
      await save(p);
      emit(id, "全部阶段完成");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e),
        role = p.state.current_stage;
      p.state.status =
        signal.aborted || e instanceof NeedsAnswer ? "interrupted" : "failed";
      p.state.error = message;
      if (role) {
        p.state.stages[role].status = p.state.status;
        p.state.stages[role].error = message;
      }
      if (e instanceof NeedsAnswer)
        p.messages.push({
          role: "assistant",
          text: e.question.title,
          question: e.question,
          at: now(),
        });
      await save(p);
      await log(id, `${p.state.status}: ${message}`);
      emit(id, message, role ?? undefined);
    }
  }
  async invalidate(id: string, from: Role) {
    const p = await get(id);
    for (const r of roles.slice(roles.indexOf(from)))
      p.state.stages[r] = {
        status: "pending",
        attempts: p.state.stages[r].attempts,
      };
    p.state.status = "pending";
    p.state.current_stage = null;
    p.state.completed = roles.filter(
      (r) => p.state.stages[r].status === "completed",
    );
    p.state.pending = roles.filter((r) => !p.state.completed.includes(r));
    p.state.error = null;
    await rm(path.join(projectDir(id), "output/poster.pdf"), { force: true });
    await save(p);
    return p;
  }
}
export const orchestrator = new Orchestrator();
