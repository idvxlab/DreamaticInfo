import { acceptAssets } from "./asset-observation.js";
import { ConceptRevision, persistSample } from "./visual-sample.js";
import { roleInstructionDigest } from "./design-contract.js";
import { contentDigest } from "./content-digest.js";
import { reviewDelivery, type Reviewer, type ReviewIssue, type ReviewRound } from "./visual-review.js";
import { inspectDelivery, requireUsableDelivery } from "./delivery-quality.js";
import { ExecutionBudget } from "./execution-budget.js";
import { RunMetrics } from "./run-metrics.js";
import { visualizationRuntimeInfo } from "./visualization-runtime.js";
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
  atomic,
  json,
  save,
  upstream,
  handoffDocuments,
} from "./store.js";
import { hash, names, schemas, validateReferences } from "./validation.js";
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
  constructor(private runner: Runner = piRunner, private reviewer?: Reviewer) {}
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
        await contentDigest(await safePath(root, f.path), "base64"),
        await contentDigest(await safePath(root, f.normalized)),
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
      skill_bodies: await roleInstructionDigest(role),
      mode: p.mode,
      design_scope: ["designer", "builder"].includes(role) ? p.execution?.design_scope : undefined,
      document_protocol: DOCUMENT_PROTOCOL,
      role_contract: hash({ schema: schemas[names[role]], prompt: await readFile(new URL(`../../../agents/${role}.md`, import.meta.url), "utf8") }),
      visualization_runtime: role === "builder" ? await visualizationRuntimeInfo() : undefined,
      handoff_documents: (await handoffDocuments(p, role)).map(doc => [doc.name, hash(doc.text)]),
    });
  }
  async reconcile(p: Project, models: Models) {
    let invalid = false;
    let invalidationRecorded = false;
    let reason = "Upstream stage is not committed";
    for (const role of roles) {
      const s = p.state.stages[role];
      if (s.status !== "completed") invalid = true;
      if (!invalid) {
        try {
          const artifact = await readArtifact(p, role);
          if (!artifact) { invalid = true; reason = "Formal artifact is missing"; }
          else if (hash(artifact) !== s.output_hash) { invalid = true; reason = "Formal Markdown/index digest changed"; }
          else if (s.input_hash !== (await this.fingerprint(p, role, models))) { invalid = true; reason = "Input contract changed: brief, upstream artifacts, visual references, model configuration, role/Skill bodies or protocol; no old draft conversion"; }
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
                  { invalid = true; reason = `Saved artifact changed: ${rel}`; }
              } catch {
                await materialize(p, role, artifact);
              }
            }
          }
        } catch (error) {
          invalid = true; reason = String(error).slice(0,500);
        }
      }
      if (invalid) {
        if (!invalidationRecorded && s.status === "completed") { p.state.invalidation = { from: role, affected: roles.slice(roles.indexOf(role)), reason, at: now() }; invalidationRecorded = true; }
        if (s.status === "completed") emit(p.id, `${role} 的输入、角色合同或成果已变化，需重新执行；历史版本保留`, role);
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
  addModelBudget(id: string, amount: number) {
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000) throw new Error("追加额度须为 1–1000 的整数");
    if (this.busy(id)) throw new Error("请先暂停任务，再追加额度");
    const controller = new AbortController();
    const done = Promise.resolve().then(async () => {
      const p = await get(id);
      if (p.state.status === "running") throw new Error("请先暂停任务，再追加额度");
      const scope = hash({ brief: p.brief, messages: p.messages.filter(m => m.role === "user"), uploads: p.uploads.map(u => u.sha256) });
      const file = path.join(projectDir(id), "state/run-usage.json");
      const usage = await json(file);
      if (usage.scope !== scope) throw new Error("需求范围已变化；请先运行当前任务，再为该范围追加额度");
      const extra = (usage.counts.model_extra_limit ?? 0) + amount;
      if (!Number.isSafeInteger(extra) || extra > 10000) throw new Error("任务累计追加额度不能超过 10000 次");
      const counts = { ...usage.counts, model_extra_limit: extra, model_task_limit: Number(setting("DREAMATIC_MODEL_TASK_LIMIT")) + extra, model_run_limit: Number(setting("DREAMATIC_MODEL_RUN_LIMIT")) };
      const grants = [...(usage.grants ?? []), { at: now(), amount, total_extra: extra }];
      await atomic(file, JSON.stringify({ ...usage, counts, grants }));
      p.state.execution_budget = counts;
      await save(p);
      await log(id, `用户明确追加模型调用额度 ${amount} 次；累计追加 ${extra} 次。历史用量、费用与返修限制保留；尚未启动运行。`);
    }).finally(() => this.active.delete(id));
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
    const parentSignal = signal;
    const p = await get(id),
      models = await getModels();
    const metrics = new RunMetrics(projectDir(id));
    const runBudget = new ExecutionBudget(signal, Number(setting("DREAMATIC_RUN_TIMEOUT_MINUTES")) * 60_000, "运行", { run: Number(setting("DREAMATIC_MODEL_RUN_LIMIT")), task: Number(setting("DREAMATIC_MODEL_TASK_LIMIT")) });
    const usageScope = hash({ brief: p.brief, messages: p.messages.filter(m => m.role === "user"), uploads: p.uploads.map(u => u.sha256) });
    const usageFile = path.join(projectDir(id), "state/run-usage.json");
    let grants: unknown[] = [];
    try { const usage = await json(usageFile); if (usage.scope === usageScope) { runBudget.restore(usage.counts); grants = usage.grants ?? []; } } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    p.state.execution_budget = runBudget.snapshot();
    let usageWrites = Promise.resolve();
    const consume: typeof runBudget.consume = kind => {
      runBudget.consume(kind);
      const counts = runBudget.snapshot(); p.state.execution_budget = counts;
      usageWrites = usageWrites.then(() => atomic(usageFile, JSON.stringify({ scope: usageScope, counts, grants })));
      void usageWrites.catch(() => {});
    };
    const metric = (kind: string, fields: Record<string, unknown>) => {
      if (kind === "model_call") {
        const usage = fields.usage as { cost?: { total?: number } } | undefined;
        runBudget.charge(usage?.cost?.total, Number(setting("DREAMATIC_MAX_REPORTED_COST_USD")));
        const counts = runBudget.snapshot(); p.state.execution_budget = counts;
        usageWrites = usageWrites.then(() => atomic(usageFile, JSON.stringify({ scope: usageScope, counts, grants })));
        void usageWrites.catch(() => {});
      }
      metrics.record(kind, fields);
    };
    signal = runBudget.signal;
    metrics.record("run_start", { effective_request_at: p.messages.find(m => m.role === "user" && m.text.trim())?.at ?? null, models });
    const endRun = metrics.span("run");
    try {
      await this.reconcile(p, models);
      if (p.state.visual_review?.status === "needs_revision" && p.state.stages.builder.status === "completed") return;
      p.state.status = "running";
      p.state.error = null;
      await save(p);
      emit(id, "任务开始");
      const repairScope = hash({ brief: p.brief, messages: p.messages.filter(m => m.role === "user"), uploads: p.uploads.map(u => u.sha256) });
      const repairFile = path.join(projectDir(id), 'state/repair.json');
      let repairIssues: ReviewIssue[] = [];
      let repairCount = 0;
      let reviewHistory: ReviewRound[] = [];
      try { const stored = await json(repairFile); if (stored.scope === repairScope) { repairIssues = stored.issues; repairCount = stored.count; reviewHistory = stored.history ?? []; } } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      let visualLimit = "";
      roleLoop: for (let roleIndex = 0; roleIndex < roles.length; roleIndex++) {
        const role = roles[roleIndex];
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
        const stageBudget = new ExecutionBudget(signal, policy.max_stage_minutes * 60_000, `${role} 阶段`);
        try {
        for (let attempt = 0; attempt < policy.retries; attempt++) {
          signal.throwIfAborted();
          p.state.stages[role].attempts++;
          await save(p);
          try {
            const stageSignal = stageBudget.signal;
            stageSignal.throwIfAborted();
            const endStage = metrics.span("stage_attempt", { role, attempt: p.state.stages[role].attempts });
            try {
            result = await this.runner(p, role, models[role], {
              signal: stageSignal,
              sample: role === "builder" && this.reviewer ? async html => {
                const design = (await readArtifact(p, "designer"))!.data;
                const scope = hash({ design, instructions: await roleInstructionDigest("designer"), models });
                const previous = p.state.visual_sample?.scope === scope ? p.state.visual_sample : undefined;
                if (previous?.status === "passed") return previous;
                const checks = (previous?.checks ?? 0) + 1;
                if (checks > 2) throw new Error("样稿检查额度已用完，保留样稿与问题；请明确修复或重新设计");
                const endSample = metrics.span("visual_sample");
                const version = await persistSample(projectDir(id), scope, html, design.page.width, stageSignal, checks).catch(error => { endSample("error"); throw error; });
                const review = await this.reviewer!(p, html, design, models, stageSignal, { metric: (kind, fields) => metric(kind, { task: "sample", ...fields }), consume: kind => consume(kind), milestone: "sample", previousIssues: previous?.issues ?? repairIssues }).catch(error => { endSample("error"); throw error; });
                await acceptAssets(projectDir(id), design, review.status, review.issues);
                p.state.visual_sample = { version, scope, status: review.status, issues: review.issues, checks };
                await atomic(path.join(projectDir(id), `state/samples/${version}/review.md`), review.markdown);
                await save(p); endSample(review.status);
                metrics.record("first_preview", { kind_of_preview: "visual_sample", wall_ms: Date.now() - Date.parse(p.messages.find(m => m.role === "user" && m.text.trim())?.at ?? p.created_at) });
                const concept = review.issues.filter(issue => issue.owner !== "builder");
                if (concept.length) throw new ConceptRevision(concept);
                return review;
              } : undefined,
              repair: repairIssues.filter(issue => issue.owner === role),
              consume: kind => consume(kind),
              metric: (kind, fields) => metric(kind, { role, ...fields }),
              event: (text) => {
                emit(id, text, role);
                void log(id, text);
              },
            });
            signal.throwIfAborted();
            validateReferences(role, result.data, await upstream(p, role));
            await validateProvenance(p, role, result.data);
            endStage();
            } catch (error) { endStage("error"); throw error; }
            break;
          } catch (e) {
            if (e instanceof ConceptRevision) {
              if (repairCount >= 2) throw new Error("概念修订额度已用完；样稿与问题已保留");
              consume("repair"); repairCount++; repairIssues = e.issues;
              metrics.record("repair", { category: "concept_or_asset", count: repairCount, issues: e.issues.map(issue => issue.id) });
              await atomic(repairFile, JSON.stringify({ scope: repairScope, issues: repairIssues, count: repairCount, history: reviewHistory }));
              const from = roles.indexOf(roles.find(r => e.issues.some(issue => issue.owner === r))!);
              for (const downstream of roles.slice(from)) p.state.stages[downstream] = { status: "pending", attempts: p.state.stages[downstream].attempts };
              p.execution = { ...p.execution, mode: "repair", at: now(), reason: "Designer visual sample findings", design_scope: crypto.randomUUID() };
              await save(p); roleIndex = from - 1; continue roleLoop;
            }
            if (
              stageBudget.signal.aborted ||
              e instanceof NeedsAnswer ||
              e instanceof DocumentSubmissionError ||
              attempt === policy.retries - 1 ||
              !/429|503|502|ECONNRESET|ETIMEDOUT|fetch failed|temporar/i.test(
                String(e),
              )
            )
              throw e;
            consume("retry");
            metrics.record("retry", { role, attempt });
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
        } finally { stageBudget.close(); }
        signal.throwIfAborted();
        if (!result) throw new Error("No stage result");
        if (role === "builder") {
          const endCheck = metrics.span("delivery_check");
          try { requireUsableDelivery(await inspectDelivery(result.data.html, (await readArtifact(p, "designer"))!.data.page.width, signal)); endCheck(); }
          catch (error) { endCheck("error"); throw error; }
        }
        await commit(p, role, result.data, result.notes, inputHash, result.markdown);
        if (role === "builder") metrics.record("first_preview", { wall_ms: Date.now() - Date.parse(p.messages.find(m => m.role === "user" && m.text.trim())?.at ?? p.created_at) });
        emit(id, `${role} 已完成`, role);
        if (role === "builder" && this.reviewer) {
          const endReview = metrics.span("visual_review", { revision: p.state.stages.builder.version, repair: repairCount });
          const review = await this.reviewer(p, result.data.html, (await readArtifact(p, "designer"))!.data, models, signal, { metric: (kind, fields) => metric(kind, { role: "designer", ...fields }), consume: kind => consume(kind), previousIssues: repairIssues, history: reviewHistory });
          endReview(review.status);
          await acceptAssets(projectDir(id), (await readArtifact(p, "designer"))!.data, review.status, review.issues);
          await atomic(path.join(projectDir(id), `state/reviews/review-${p.state.stages.builder.version}.md`), review.markdown);
          const resolved = review.status === "unsupported" ? [] : repairIssues.filter(issue => !review.issues.some(item => item.id === issue.id)).map(issue => issue.id);
          repairIssues = review.status === "unsupported" ? repairIssues : review.issues;
          reviewHistory.push({ design_revision: p.state.stages.designer.version, revision: p.state.stages.builder.version!, issues: repairIssues, resolved, status: review.status });
          p.state.visual_review = { status: review.status === "issues" ? "pending" : review.status, revision: p.state.stages.builder.version!, issues: repairIssues, rounds: reviewHistory.length };
          await atomic(path.join(projectDir(id), 'state/reviews/history.json'), JSON.stringify({ scope: repairScope, history: reviewHistory }));
          if (review.status === "unsupported") visualLimit = review.markdown;
          if (review.issues.length) {
            if (repairCount >= 2) {
              p.state.visual_review.status = "needs_revision";
              await atomic(repairFile, JSON.stringify({ scope: repairScope, issues: repairIssues, count: repairCount, history: reviewHistory }));
              emit(id, "作品已生成，视觉验收未通过；自动返修额度已用完，保留作品与问题清单", "builder");
              break;
            }
            consume("repair");
            repairIssues = review.issues; repairCount++;
            await atomic(repairFile, JSON.stringify({ scope: repairScope, issues: repairIssues, count: repairCount, history: reviewHistory }));
            const owner = roles.find(r => review.issues.some(issue => issue.owner === r))!;
            const from = roles.indexOf(owner);
            for (const downstream of roles.slice(from)) p.state.stages[downstream] = { status: "pending", attempts: p.state.stages[downstream].attempts };
            metrics.record("repair", { owner, count: repairCount, issues: review.issues.map(({ id, owner, component }) => ({ id, owner, component })) });
            await save(p); roleIndex = from - 1;
            emit(id, `视觉复核发现问题，交由 ${owner} 局部返修`, owner);
          }
        }

      }
      if (p.state.visual_review?.status !== "needs_revision") await rm(repairFile, { force: true });
      p.state.status = "completed";
      p.state.current_stage = null;
      p.state.error = null;
      p.messages.push({
        role: "assistant",
        text: p.state.visual_review?.status === "needs_revision" ? "作品已生成，可查看并导出；视觉验收未通过，自动返修额度已用完。请查看保留的问题清单。" : "信息图已完成，可查看事实、设计与作品，并导出 HTML 或 PDF。" + visualLimit,
        at: now(),
      });
      await save(p);
      metrics.record("delivery", { wall_ms: Date.now() - Date.parse(p.messages.find(m => m.role === "user" && m.text.trim())?.at ?? p.created_at), builder_version: p.state.stages.builder.version, visual_acceptance: p.state.visual_review?.status });
      emit(id, p.state.visual_review?.status === "needs_revision" ? "生成完成，视觉验收未通过" : "全部阶段完成");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e),
        role = p.state.current_stage;
      p.state.status =
        parentSignal.aborted || e instanceof NeedsAnswer ? "interrupted" : "failed";
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
      metrics.record(e instanceof NeedsAnswer ? "waiting_for_information" : parentSignal.aborted ? "interrupted" : "failed");
      emit(id, message, role ?? undefined);
    } finally {
      runBudget.close();
      endRun(p.state.status);
      await usageWrites.catch(error => log(id, `预算记录保存失败：${String(error)}`));
      await metrics.flush().catch(error => log(id, `性能记录保存失败：${String(error)}`));
    }
  }
  async invalidate(id: string, from: Role, reason = "Manual stage rerun") {
    const p = await get(id);
    for (const r of roles.slice(roles.indexOf(from)))
      p.state.stages[r] = {
        status: "pending",
        attempts: p.state.stages[r].attempts,
      };
    p.state.status = "pending";
    p.state.invalidation = { from, affected: roles.slice(roles.indexOf(from)), reason, at: now() };
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
export const orchestrator = new Orchestrator(piRunner, reviewDelivery);
