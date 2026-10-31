import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Project, ResearchProgress, SearchHit, CollectedSource } from "../../../packages/shared/types.js";
import { atomic, now, projectDir } from "./store.js";
import { setting, CONFIG_FIELDS } from "./config-store.js";
import { hash } from "./validation.js";
import { searchWeb, fetchSource } from "./network.js";
import { readProgress, researchScope, updateProgress, readableSource } from "./research-state.js";
import { normalizeQuery, parseSearchPlan } from "./research-plan.js";
export type ResearchTransport = { search: (query: string, signal?: AbortSignal) => Promise<SearchHit[]>; fetch: typeof fetchSource };
const transport: ResearchTransport = { search: searchWeb, fetch: fetchSource };
const inFlight = new Map<string, Promise<any>>();
function once<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key); if (existing) return existing;
  const promise = run().finally(() => { if (inFlight.get(key) === promise) inFlight.delete(key); });
  inFlight.set(key, promise); return promise;
}
export function canonicalUrl(url: string) {
  const u = new URL(url);
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) throw new Error("仅支持公开 HTTPS 来源");
  u.hash = ""; return u.href;
}
export class ResearchWorkbench {
  private constructor(readonly project: Project, readonly scope: string, private network: ResearchTransport) {}
  static async open(project: Project, network = transport) {
    const scope = await researchScope(project);
    await updateProgress(project, scope, state => {
      for (const task of state.tasks) if (task.status === "running") { task.status = "failed"; task.error = "上次搜索中断，可显式重试"; }
      for (const source of state.sources) if (source.status === "fetching") { source.status = "failed"; source.reason = "上次采集中断，可显式重试"; }
    });
    return new ResearchWorkbench(project, scope, network);
  }
  async snapshot() { return (await readProgress(this.project))!; }
  async savePlan(markdown: string) {
    const tasks = parseSearchPlan(markdown, this.project.uploads.length > 0);
    await updateProgress(this.project, this.scope, async state => {
      if (state.tasks.some(t => t.status === "running") || state.sources.some(s => s.status === "fetching")) throw new Error("请等待当前搜索和采集结束后调整计划");
      const prior = [...state.tasks, ...state.archived_tasks];
      state.tasks = tasks.map(task => {
        const previous = prior.find(old => normalizeQuery(old.query) === normalizeQuery(task.query));
        return { status: "pending", hits: [], attempts: 0, updated_at: now(), ...previous, ...task };
      });
      state.archived_tasks = prior.filter((task, i) => !state.tasks.some(active => active.id === task.id && normalizeQuery(active.query) === normalizeQuery(task.query)) && prior.findIndex(other => other.id === task.id && other.query === task.query) === i);
      state.plan_markdown = markdown; state.revision++;
      await atomic(path.join(projectDir(this.project.id), "research/runs", this.scope, `plan-${state.revision}.md`), markdown);
    });
    return this.report();
  }
  async report(candidates = false) {
    const state = await this.snapshot();
    const tasks = state.tasks.map(t => `- ${t.id} / ${t.status} / ${t.query}：${t.hits.length} 条候选${t.error ? `；${t.error}` : ""}${candidates ? t.hits.slice(0, 5).map(hit => `\n  - ${hit.title}：${hit.url}`).join("") : ""}`).join("\n");
    return `# 调研进展\n\n${state.plan_markdown || "尚未制定计划；先调用 save_search_plan。"}\n\n## 队列执行状态\n${tasks}\n\n## 已采集资料\n${state.sources.map(s => `- ${s.id} / ${s.status}：${s.title} ${s.url}\n  ${s.reason}${s.source ? `\n  来源编号：${s.source.id}；正文：${s.source.path}` : ""}`).join("\n") || "暂无"}\n\naccepted 只表示正文可读，仍需核实内容与统计口径。候选每项最多展示 5 条，调用 search_web 可复用完整结果。复用已完成搜索和可用来源；失败项显式 retry 后才重试。`;
  }
  async search(taskId: string, signal?: AbortSignal, retry = false) {
    const config = hash([setting("DREAMATIC_SEARCH_PROVIDER"), setting("DREAMATIC_SEARCH_API_KEY"), setting("DREAMATIC_SEARCH_RESULTS")]);
    return once(`${this.project.id}/${this.scope}/search/${taskId}/${config}`, async () => {
      let query = "", cached: SearchHit[] | undefined;
      await updateProgress(this.project, this.scope, state => {
        const task = state.tasks.find(t => t.id === taskId);
        if (!state.revision || !task) throw new Error("先保存搜索计划，再使用队列中的 task_id 搜索");
        query = task.query;
        if (task.status === "completed" && task.config_key === config) { cached = task.hits; return; }
        if (task.status === "failed" && task.config_key === config && !retry) throw new Error(`该关键词上次失败：${task.error}；改用其他关键词，或设置 retry=true`);
        if (task.config_key !== config) task.config_attempts = 0;
        if ((task.config_attempts ?? 0) >= Number(setting("DREAMATIC_RESEARCH_REQUEST_ATTEMPTS"))) throw new Error("该关键词已达到调研请求次数上限，请调整计划");
        task.status = "running"; task.attempts++; task.config_attempts = (task.config_attempts ?? 0) + 1; task.config_key = config; task.error = undefined; task.updated_at = now();
      });
      if (cached) return { hits: cached, reused: true };
      try {
        signal?.throwIfAborted();
        const urls = new Set<string>();
        const hits = (await this.network.search(query, signal)).flatMap(hit => {
          try {
            const url = canonicalUrl(hit.url);
            if (urls.has(url)) return [];
            urls.add(url);
            return [{ title: String(hit.title || url).slice(0, 500), url, description: String(hit.description || "").slice(0, 2500) }];
          } catch { return []; }
        }).slice(0, Number(setting("DREAMATIC_SEARCH_RESULTS")));
        await updateProgress(this.project, this.scope, state => { const task = state.tasks.find(t => t.id === taskId)!; task.hits = hits; task.status = "completed"; task.updated_at = now(); });
        return { hits, reused: false };
      } catch (error) {
        await updateProgress(this.project, this.scope, state => { const task = state.tasks.find(t => t.id === taskId)!; task.status = "failed"; task.error = String(error); task.updated_at = now(); }); throw error;
      }
    });
  }
  async collect(url: string, taskId: string, signal?: AbortSignal, retry = false) {
    const canonical = canonicalUrl(url);
    const readerConfig = hash(["reader-v2-native", ...CONFIG_FIELDS.filter(field => field.key.startsWith("DREAMATIC_WEB_") || field.key === "DREAMATIC_CHROME_PATH").map(field => setting(field.key))]);
    const check = await this.snapshot();
    if (!check.revision || !check.tasks.some(t => t.id === taskId)) throw new Error("先制定计划，并指定该采集对应的 task_id");
    const result = await once(`${this.project.id}/${this.scope}/source/${canonical}`, async () => {
      const current = await this.snapshot();
      if (!current.revision || !current.tasks.some(t => t.id === taskId)) throw new Error("先制定计划，并指定该采集对应的 task_id");
      const old = current.sources.find(s => s.requested_url === canonical || s.url === canonical);
      if (old?.status === "accepted") {
        try { await readableSource(this.project, old); return { entry: old, reused: true }; }
        catch (error) { await updateProgress(this.project, this.scope, state => { const entry = state.sources.find(s => s.id === old.id)!; entry.status = "failed"; entry.reason = String(error); }); }
      } else if (old && old.reader_config === readerConfig && !retry) return { entry: old, reused: true };
      const id = old?.id ?? `candidate-${randomUUID()}`;
      await updateProgress(this.project, this.scope, state => {
        if (!state.tasks.some(t => t.id === taskId)) throw new Error("采集对应的关键词已被移出计划");
        const existing = state.sources.find(s => s.id === id);
        if (existing?.reader_config === readerConfig && (existing.reader_attempts ?? 0) >= Number(setting("DREAMATIC_RESEARCH_REQUEST_ATTEMPTS"))) throw new Error("该链接已达到采集次数上限，请改用其他来源");
        const entry: CollectedSource = { id, requested_url: canonical, url: canonical, title: canonical, status: "fetching", reason: "正在获取正文", task_ids: [...new Set([...(existing?.task_ids ?? []), taskId])], updated_at: now(), attempts: (existing?.attempts ?? 0) + 1 };
        entry.reader_config = readerConfig; entry.reader_attempts = (existing?.reader_config === readerConfig ? existing.reader_attempts ?? 0 : 0) + 1;
        if (existing) Object.assign(existing, entry, { source: undefined, preview: undefined, raw_path: undefined, rendered_path: undefined, reader: undefined, redirect_chain: undefined, diagnostics: undefined, content_scope: undefined, content_hash: undefined }); else state.sources.push(entry);
      });
      try {
        signal?.throwIfAborted();
        const found = await this.network.fetch(this.project.id, canonical, signal);
        let entry!: CollectedSource;
        await updateProgress(this.project, this.scope, state => {
          entry = state.sources.find(s => s.id === id)!;
          const { document, preview, raw_path, rendered_path, reader, redirect_chain, diagnostics, quality, content_scope, ...source } = found;
          Object.assign(entry, { title: found.title, url: found.url, status: quality.status, reason: quality.reason, source, preview, raw_path, rendered_path, reader, redirect_chain, diagnostics, content_scope, content_hash: hash(document), updated_at: now() });
        });
        return { entry, reused: false };
      } catch (error) {
        await updateProgress(this.project, this.scope, state => { const entry = state.sources.find(s => s.id === id)!; entry.status = "failed"; entry.reason = String(error); entry.updated_at = now(); }); throw error;
      }
    });
    if (!result.entry.task_ids.includes(taskId)) await updateProgress(this.project, this.scope, state => {
      const entry = state.sources.find(s => s.id === result.entry.id)!;
      entry.task_ids = [...new Set([...entry.task_ids, taskId])];
      result.entry = entry;
    });
    return result;
  }
}
