import { renderDocument, parseDocument } from "./markdown-protocol.js";
import type { Research, Source } from "../../../packages/shared/types.js";
import { ResearchToolError, ResearchFeedbackPolicy, researchFeedback } from "./research-feedback.js";
import { missingSearchQuery } from "../../../packages/shared/research.js";
import { searchOfficial, inspectOfficial, acquireOfficial, validateDatasetSelection, verifyOfficialRecord, type DatasetSelection, type InspectedRecord } from "./source-connectors.js";
import { saveAcquiredData } from "./dataset-acquisition.js";
import { ACQUISITION_VERSION, SOURCE_REGISTRY, connectorId } from "./source-registry.js";
import { acquisitionBatch } from "./acquisition-scheduler.js";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { Project, ResearchProgress, SearchHit, CollectedSource } from "../../../packages/shared/types.js";
import { atomic, now, projectDir, safePath, json } from "./store.js";
import { setting, CONFIG_FIELDS } from "./config-store.js";
import { hash } from "./validation.js";
import { searchWeb, fetchSource } from "./network.js";
import { readProgress, researchScope, updateProgress, readableSource } from "./research-state.js";
import { normalizeQuery, parseSearchPlan } from "./research-plan.js";
export type ResearchTransport = { search: (query: string, signal?: AbortSignal) => Promise<SearchHit[]>; fetch: typeof fetchSource; official?: typeof searchOfficial; inspect?: typeof inspectOfficial; acquire?: typeof acquireOfficial; verify?: typeof verifyOfficialRecord };
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
export function candidateId(hit: SearchHit) { return `C-${hash([hit.metadata?.connector ?? "web",hit.metadata?.record_id ?? null,canonicalUrl(hit.url)]).slice(0,20)}`; }
export class ResearchWorkbench {
  private itemFeedback=new ResearchFeedbackPolicy();
  private constructor(readonly project: Project, readonly scope: string, private network: ResearchTransport) {}
  static async open(project: Project, network = transport) {
    const scope = await researchScope(project);
    await updateProgress(project, scope, state => {
      for (const task of state.tasks) if (task.status === "running") { task.status = "failed"; task.error = "上次搜索中断，可显式重试"; task.feedback={category:"interrupted",code:"interrupted",message:task.error,next_action:"显式重试任务，已成功的来源会复用。",repeated:1}; }
      for (const source of state.sources) if (source.status === "fetching") { source.status = "failed"; source.reason = "上次采集中断，可显式重试"; source.feedback={category:"interrupted",code:"interrupted",message:source.reason,next_action:"显式重试采集。",repeated:1}; }
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
        const previous = prior.find(old => old.target === task.target && normalizeQuery(old.query) === normalizeQuery(task.query));
        return { status: "pending", hits: [], attempts: 0, updated_at: now(), ...previous, ...task, resolution: previous?.question === task.question ? previous.resolution : undefined };
      });
      state.archived_tasks = prior.filter((task, i) => !state.tasks.some(active => active.id === task.id && active.target === task.target && normalizeQuery(active.query) === normalizeQuery(task.query)) && prior.findIndex(other => other.id === task.id && other.target === task.target && other.query === task.query) === i);
      state.report_revision=undefined;
      state.plan_markdown = markdown; state.revision++;
      await atomic(path.join(projectDir(this.project.id), "research/runs", this.scope, `plan-${state.revision}.md`), markdown);
    });
    return this.report();
  }
  async saveCoverage(markdown:string) {
    if(markdown.length>20000)throw new Error("覆盖记录过长");
    const lines=markdown.trim().split("\n").map(line=>line.trim()).filter(Boolean);
    const rows=lines.map(line=>line.replace(/^\||\|$/g,"").split("|").map(cell=>cell.trim()));
    if(rows[0]?.join("/")!=="任务/来源编号/缺口说明" || rows[1]?.length!==3 || !rows[1].every(cell=>/^:?-{3,}:?$/.test(cell)) || rows.length<3)throw new Error("覆盖记录使用三列表格：任务、来源编号、缺口说明；无来源或无缺口时写无");
    const seen=new Set<string>();
    await updateProgress(this.project,this.scope,state=>{
      for(const row of rows.slice(2)) {
        const [id,sources,gap]=row,task=state.tasks.find(task=>task.id===id);
        if(row.length!==3 || !task || seen.has(id))throw new ResearchToolError("coverage_task_id", "parameter", `覆盖记录任务编号无效或重复：${id}`, `任务列只填写编号；当前有效编号：${state.tasks.map(t=>t.id).join(", ")}。不要附加任务标题。`);
        seen.add(id);
        const source_ids=sources === "无" ? [] : sources.split(/[,，、\s]+/).filter(Boolean);
        if(!source_ids.length && (!gap || gap === "无" || gap.length<10))throw new Error("未覆盖的问题必须记录具体缺口（至少 10 字符）");
        if(!gap)throw new ResearchToolError("coverage_gap", "parameter", "缺口说明不能为空", "完整覆盖写无；部分覆盖同时保留来源编号和具体缺口。");
        for(const source_id of source_ids)if(!this.project.uploads.some(u=>u.id===source_id) && !state.sources.some(s=>s.status==="accepted" && s.source?.id===source_id))throw new Error("覆盖记录只能使用当前有效来源编号");
        task.resolution={source_ids,gap:gap === "无" ? null : gap};
      }
      state.report_revision=undefined;
      return atomic(path.join(projectDir(this.project.id),"research/runs",this.scope,`coverage-${randomUUID()}.md`),markdown);
    });
    return this.report();
  }
  async composeReport(markdown:string) {
    await this.assertReady();
    const initialFingerprint=await this.reportFingerprint();
    if(!markdown.trim() || markdown.length>40000)throw new ResearchToolError("report_narrative","parameter","调研草稿为空或过长","使用概要、采用来源、局限、说明四个 Markdown 章节。");
    const sections:Record<string,string[]>={},allowed=new Set(["概要","采用来源","局限","说明"]);let section="";
    for(const line of markdown.split("\n")) {
      if(/^# /.test(line))continue;
      const heading=/^## (.+?)\s*$/.exec(line);
      if(heading){section=heading[1];if(!allowed.has(section)||sections[section])throw new Error("调研草稿章节无效或重复；只使用概要、采用来源、局限、说明");sections[section]=[];}
      else if(section)sections[section].push(line);
      else if(line.trim())throw new Error("请将草稿内容放入概要、采用来源、局限或说明章节");
    }
    const summary=sections["概要"]?.join("\n").trim();
    const list=(name:string)=>{const text=sections[name]?.join("\n").trim();if(text==="无")return [];if(!text || text.split("\n").some(l=>l.trim()&&!/^[-*] /.test(l.trim())))throw new Error(`${name} 使用 Markdown 列表，空列表写无`);return text.split("\n").filter(l=>l.trim()).map(l=>l.trim().slice(2).trim());};
    if(!summary)throw new Error("调研草稿需要概要");
    const ids=list("采用来源");if(!ids.length||new Set(ids).size!==ids.length)throw new Error("采用来源需填写不重复的有效来源编号列表");
    const state=await this.snapshot(),sources:Source[]=[],datasets:Research["datasets"]=[];
    for(const id of ids) {
      const upload=this.project.uploads.find(u=>u.id===id),entry=state.sources.find(s=>s.status==="accepted"&&s.source?.id===id);
      let source:Source;
      if(upload)source={id,title:upload.name,url:null,published_at:null,accessed_at:now(),kind:"upload",path:upload.normalized,fields:[],limitations:[]};
      else {if(!entry?.source)throw new ResearchToolError("report_source","parameter",`来源编号不可用：${id}`,"调用 read_research_progress，复制已采集来源的正式编号。");await readableSource(this.project,entry);source=entry.source;}
      sources.push(source);
      if(entry?.acquisition || upload && /\.(csv|tsv|xlsx|json)$/i.test(upload.path))datasets.push({id:`DS-${hash(id).slice(0,16)}`,source_id:id,path:source.path,fields:source.fields,description:source.title});
    }
    for(const task of state.tasks)for(const id of task.resolution?.source_ids ?? [])if(!ids.includes(id))throw new Error(`采用来源遗漏覆盖记录引用的来源：${id}`);
    const limitations=[...new Set([...list("局限"),...state.tasks.flatMap(t=>t.resolution?.gap?[t.resolution.gap]:[]),...sources.flatMap(s=>s.limitations)])];
    const formal=renderDocument("researcher",{summary,sources,datasets,limitations},sections["说明"]?.join("\n").trim() ?? "");
    const revision=randomUUID(),dir=path.join(projectDir(this.project.id),"research/runs",this.scope,"reports");
    const fingerprint=await this.reportFingerprint();
    if(fingerprint!==initialFingerprint)throw new Error("调研输入已变化，请重新编排草稿");
    await atomic(path.join(dir,`${revision}.md`),formal);
    await atomic(path.join(dir,`${revision}.json`),JSON.stringify({fingerprint,digest:hash(formal)}));
    await updateProgress(this.project,this.scope,current=>{current.report_revision=revision;});
    return {draft_revision:revision,path:`research/runs/${this.scope}/reports/${revision}.md`,next_action:"submit_stage({draft_revision})；来源和数据集字段由系统生成，无需重新填写。"};
  }
  private async reportFingerprint() {
    const state=await this.snapshot();
    const materials=[];
    for(const upload of this.project.uploads){materials.push([upload.id,hash((await readFile(await safePath(projectDir(this.project.id),upload.path))).toString("base64")),hash(await readFile(await safePath(projectDir(this.project.id),upload.normalized),"utf8"))]);}
    for(const entry of state.sources)if(entry.status==="accepted")await readableSource(this.project,entry);
    return hash([this.project.brief,this.scope,await this.feedbackState(),materials]);
  }
  async submitReport(revision:string) {
    await this.assertReady();
    if(!/^[a-f0-9-]{36}$/.test(revision))throw new Error("调研草稿版本编号无效");
    const state=await this.snapshot();if(state.report_revision!==revision)throw new Error("调研草稿版本已过期，请重新 compose_research_report");
    const dir=path.join(projectDir(this.project.id),"research/runs",this.scope,"reports"), receipt=await json(path.join(dir,`${revision}.json`)),markdown=await readFile(path.join(dir,`${revision}.md`),"utf8");
    if(receipt.digest!==hash(markdown)||receipt.fingerprint!==await this.reportFingerprint())throw new Error("调研草稿或输入已变化，请重新 compose_research_report");
    return parseDocument("researcher",markdown);
  }
  async assertReady() {
    const state=await this.snapshot();
    if(!state.revision)throw new Error("先保存调研计划");
    for(const task of state.tasks) {
      if(!task.resolution)throw new Error(`任务 ${task.id} 尚未记录问题覆盖情况；用 save_research_coverage 绑定来源或说明缺口`);
      for(const id of task.resolution.source_ids) {
        if(this.project.uploads.some(u=>u.id===id))continue;
        const entry=state.sources.find(s=>s.source?.id===id);
        if(!entry)throw new Error("覆盖记录来源已失效");
        await readableSource(this.project,entry);
      }
    }
  }
  async report(candidates = false) {
    const state = await this.snapshot();
    const tasks = state.tasks.map(t => `- ${t.id} / ${t.target} / ${t.status} / ${t.query}：${t.hits.length} 条候选${t.resolution ? `；${t.resolution.gap ? `缺口：${t.resolution.gap}` : `依据：${t.resolution.source_ids.join(", ")}`}` : "；覆盖情况待记录"}${t.error ? `；${t.error}` : ""}${candidates ? t.hits.slice(0, 5).map(hit => `\n  - ${hit.candidate_id ?? candidateId(hit)} · ${hit.title}：${hit.url}`).join("") : ""}`).join("\n");
    return `# 调研进展\n\n${state.plan_markdown || "尚未制定计划；先调用 save_search_plan。"}\n\n## 队列执行状态\n${tasks}\n\n${state.report_revision ? `可提交草稿版本：${state.report_revision}；使用 submit_stage({draft_revision})，无需重发 Markdown。` : "尚无编排草稿。"}\n\n## 已采集资料\n${state.sources.map(s => `- ${s.id} / ${s.status}：${s.title} ${s.url}\n  ${s.reason}${s.source ? `\n  来源编号：${s.source.id}；正文：${s.source.path}` : ""}`).join("\n") || "暂无"}\n\n有效任务编号：${state.tasks.map(t=>t.id).join(", ") || "无网络任务"}。下一步：待检索专门来源用 search_sources；有候选用 inspect_dataset 的 candidate_id；已知编号用 verify_official_record；web 用 search_web；资料足够后 save_research_coverage 并 compose_research_report。\n\naccepted 只表示正文可读，仍需核实内容与统计口径。候选每项最多展示 5 条，调用 search_sources 可复用完整结果。复用已完成搜索和可用来源；失败项显式 retry 后才重试。`;
  }
  async search(taskId: string, signal?: AbortSignal, retry = false, supplemental?: { purpose: "data_gap" | "background" | "image"; reason: string; related_task_ids?: string[] }) {
    signal = this.operationSignal(signal);
    const saved = (await this.snapshot()).tasks.find(t => t.id === taskId);
    if (saved && missingSearchQuery(saved.query)) throw new Error(`任务 ${taskId} 关键词尚未填写，请先修正搜索计划；尚未发起搜索请求`);
    if (saved?.target === "web") {
      if (!supplemental?.reason.trim() || supplemental.reason.length < 10) throw new Error("补充搜索必须记录用途与具体理由（至少 10 字符）");
      if (supplemental.purpose === "data_gap") {
        const ids=supplemental.related_task_ids ?? [], state=await this.snapshot();
        if(!ids.length || new Set(ids).size!==ids.length || ids.some(id=>!state.tasks.some(t=>t.id===id && t.target!=="web" && t.status==="completed")))
          throw new ResearchToolError("related_tasks", "prerequisite", "数据缺口搜索需关联已完成检索的专门来源任务", `填写 related_task_ids；可用编号：${state.tasks.filter(t=>t.target!=="web" && t.status==="completed").map(t=>t.id).join(", ") || "尚无，先 search_sources"}。背景解释使用 purpose=background。`);
      }
    } else if (supplemental) throw new Error("补充搜索需要目标来源为 web 的计划条目");
    const started = Date.now();
    const config = hash([ACQUISITION_VERSION, saved?.target, supplemental, setting("DREAMATIC_SEARCH_PROVIDER"), setting("DREAMATIC_SEARCH_API_KEY"), setting("DREAMATIC_SEARCH_RESULTS"), setting("DREAMATIC_KAGGLE_TOKEN"), setting("DREAMATIC_NCBI_API_KEY")]);
    return once(`${this.project.id}/${this.scope}/search/${taskId}/${config}`, async () => {
      let query = "", cached: SearchHit[] | undefined;
      await updateProgress(this.project, this.scope, state => {
        const task = state.tasks.find(t => t.id === taskId);
        if (!state.revision || !task) throw new Error("先保存搜索计划，再使用队列中的 task_id 搜索");
        query = task.query;
        task.supplemental = supplemental;
        if (task.status === "completed" && task.config_key === config) { cached = task.hits; return; }
        if (task.status === "failed" && task.config_key === config && !retry) throw new Error(`该关键词上次失败：${task.error}；改用其他关键词，或设置 retry=true`);
        if (task.config_key !== config) task.config_attempts = 0;
        if ((task.config_attempts ?? 0) >= Number(setting("DREAMATIC_RESEARCH_REQUEST_ATTEMPTS"))) throw new Error("该关键词已达到调研请求次数上限，请调整计划");
        task.status = "running"; task.attempts++; task.config_attempts = (task.config_attempts ?? 0) + 1; task.config_key = config; task.error = undefined; task.feedback=undefined; task.updated_at = now();
      });
      if (cached) return { hits: cached.map(hit=>({...hit,candidate_id:hit.candidate_id ?? candidateId(hit)})), reused: true };
      try {
        signal?.throwIfAborted();
        const urls = new Set<string>();
        const hits = (await (saved!.target === "web" ? this.network.search(query, signal) : this.network.official ? this.network.official(saved!.target,query,signal) : this.network !== transport ? this.network.search(query,signal) : searchOfficial(saved!.target,query,signal))).flatMap(hit => {
          try {
            const url = canonicalUrl(hit.url);
            if (urls.has(url)) return [];
            urls.add(url);
            return [{ ...hit, candidate_id: candidateId(hit), title: String(hit.title || url).slice(0, 500), url, description: String(hit.description || "").slice(0, 1500) }];
          } catch { return []; }
        }).slice(0, Number(setting("DREAMATIC_SEARCH_RESULTS")));
        await updateProgress(this.project, this.scope, state => { const task = state.tasks.find(t => t.id === taskId)!; task.duration_ms = Date.now() - started; task.hits = hits; task.status = "completed"; task.updated_at = now(); });
        return { hits, reused: false };
      } catch (error) {
        await updateProgress(this.project, this.scope, state => { const task = state.tasks.find(t => t.id === taskId)!; task.duration_ms = Date.now() - started; task.status = "failed"; task.error = String(error); task.feedback=researchFeedback(error,"search_sources"); task.updated_at = now(); }); throw error;
      }
    });
  }
  private operationSignal(parent?:AbortSignal) {
    const signal=AbortSignal.any([parent ?? new AbortController().signal,AbortSignal.timeout(Number(setting("DREAMATIC_ACQUISITION_TIMEOUT_MS")))]);
    signal.throwIfAborted();return signal;
  }
  registry() { return SOURCE_REGISTRY; }
  async searchBatch(taskIds: string[], signal?: AbortSignal, retry = false) {
    if (!taskIds.length || taskIds.length > 6 || new Set(taskIds).size !== taskIds.length) throw new Error("一次选择 1–6 个不同的专门来源任务");
    const state = await this.snapshot();
    if (taskIds.some(id => !state.tasks.some(t => t.id === id && t.target !== "web"))) throw new Error("批量查询只支持计划中的专门来源任务");
    return acquisitionBatch(taskIds, Number(setting("DREAMATIC_ACQUISITION_CONCURRENCY")), async id => {
      const result=await this.itemFeedback.execute("search_sources:item",{id,retry},await this.feedbackState(),()=>this.search(id,signal,retry));
      if(!result.ok)throw new ResearchToolError(result.feedback.code,result.feedback.category,result.feedback.message,result.feedback.next_action);
      return result.value;
    }, signal);
  }
  async inspect(taskId: string, reference: string, signal?: AbortSignal) {
    signal=this.operationSignal(signal);
    const state = await this.snapshot(), task = state.tasks.find(t => t.id === taskId);
    const candidate = task?.hits.find(h => reference === (h.candidate_id ?? candidateId(h)) || reference === h.url);
    if (!candidate?.metadata) throw new ResearchToolError("candidate_reference", "prerequisite", "候选编号不属于当前任务的专门来源结果", `当前任务：${state.tasks.map(t=>t.id).join(", ")}；该任务候选：${task?.hits.map(h=>`${h.candidate_id ?? candidateId(h)} ${h.title}`).join("；") || "暂无"}。已知官方编号可用 verify_official_record 核验登记，不要猜测 URL。`);
    const key = hash(candidate);
    const cached = task?.inspection?.[key] as InspectedRecord | undefined;
    if (cached) return cached;
    const record = await (this.network.inspect ?? inspectOfficial)(candidate, signal);
    await updateProgress(this.project, this.scope, current => { const t=current.tasks.find(t=>t.id===taskId)!;t.inspection={...t.inspection,[key]:record}; });
    return record;
  }
  async verify(taskId:string, recordId:string, signal?:AbortSignal) {
    const state=await this.snapshot(),task=state.tasks.find(t=>t.id===taskId);
    if(!task || task.target === "web")throw new ResearchToolError("verify_task","prerequisite","核验需要当前专门来源任务编号",`当前任务：${state.tasks.map(t=>`${t.id}:${t.target}`).join(", ")}`);
    const hit=await (this.network.verify ?? verifyOfficialRecord)(task.target,recordId,this.operationSignal(signal));
    hit.candidate_id=candidateId(hit);
    await updateProgress(this.project,this.scope,current=>{const active=current.tasks.find(t=>t.id===taskId && t.target===task.target);if(!active)throw new Error("任务已变化，重新读取计划");if(!active.hits.some(h=>candidateId(h)===hit.candidate_id))active.hits.push(hit);active.status="completed";active.attempts++;active.error=undefined;active.feedback=undefined;active.updated_at=now();});
    return {...hit,next_action:"inspect_dataset({task_id,candidate_id})，检查后 fetch_datasets 获取选定切片或文件。"};
  }
  async feedbackState() {
    const state=await this.snapshot();
    return hash([state.revision,state.tasks.map(t=>[t.id,t.target,t.status,t.resolution,t.hits.map(candidateId)]),state.sources.map(s=>[s.id,s.status,s.content_hash])]);
  }
  async acquireBatch(requests: { task_id:string; url:string; rationale:string; selection:DatasetSelection; retry?:boolean }[], signal?:AbortSignal) {
    if(!requests.length || requests.length>3)throw new Error("一次获取 1–3 个选定数据切片或文件");
    return acquisitionBatch(requests,Number(setting("DREAMATIC_ACQUISITION_CONCURRENCY")),async r=>{
      const result=await this.itemFeedback.execute("fetch_datasets:item",r,await this.feedbackState(),()=>this.acquire(r.task_id,r.url,r.selection,r.rationale,signal,r.retry));
      if(!result.ok)throw new ResearchToolError(result.feedback.code,result.feedback.category,result.feedback.message,result.feedback.next_action);
      return result.value;
    },signal);
  }
  async acquire(taskId: string, url: string, selection: DatasetSelection, rationale: string, signal?: AbortSignal, retry = false) {
    signal=this.operationSignal(signal);
    if (rationale.trim().length < 10) throw new Error("请说明数据与问题的匹配性、来源可靠性和使用条件（至少 10 字符）");
    const task=(await this.snapshot()).tasks.find(t=>t.id===taskId);
    if(!task)throw new Error("任务编号不在当前计划中");
    validateDatasetSelection(task.target,selection);
    const record = await this.inspect(taskId,url,signal);

    if (/\b(synthetic|simulated|fictional|dummy)\b/i.test(`${record.hit.title} ${record.hit.description} ${JSON.stringify(record.details)}`)) throw new Error("合成/演示数据不能作为真实世界事实来源");
    if (selection.upstream_url) {
      const supplied=canonicalUrl(selection.upstream_url);
      if (!JSON.stringify(record.details).includes(supplied) || /\.(?:png|jpe?g|gif|svg)(?:[?#]|$)/i.test(supplied)) throw new Error("原始出处必须是来源元数据实际包含的资料链接");
      record.metadata={...record.metadata,upstream_url:supplied};
    }
    if (record.metadata.connector === "kaggle" && !record.metadata.upstream_url) throw new Error("Kaggle 记录缺少可追溯原始出处；从元数据中选择 upstream_url 或使用其他数据集");
    const key=new URL(record.hit.url);key.searchParams.set("selection",hash([record.metadata,selection]));
    return this.collect(key.href,taskId,signal,retry,async()=>{
      const acquired=await (this.network.acquire ?? acquireOfficial)(record,selection,signal);
      acquired.limitations.push(`Researcher selection rationale: ${rationale}`);
      return saveAcquiredData(this.project.id,acquired);
    });
  }
  async collect(url: string, taskId: string, signal?: AbortSignal, retry = false, loader?: () => Promise<any>) {
    const canonical = canonicalUrl(url);
    const readerConfig = hash([ACQUISITION_VERSION, setting("DREAMATIC_KAGGLE_TOKEN"), setting("DREAMATIC_NCBI_API_KEY"), "reader-v2-native", ...CONFIG_FIELDS.filter(field => field.key.startsWith("DREAMATIC_WEB_") || field.key === "DREAMATIC_CHROME_PATH").map(field => setting(field.key))]);
    const check = await this.snapshot();
    if (!check.revision || !check.tasks.some(t => t.id === taskId)) throw new Error("先制定计划，并指定该采集对应的 task_id");
    const task = check.tasks.find(t => t.id === taskId)!;
    if (!loader && this.network === transport) {
      const target=connectorId(task.target), host=new URL(canonical).hostname;
      if (!["pubmed","nbs","web"].includes(target)) throw new Error("数据目录不是数据正文，请使用 inspect_dataset / fetch_datasets 获取选定数据");
      if (target === "pubmed" && !["pubmed.ncbi.nlm.nih.gov","pmc.ncbi.nlm.nih.gov","www.ncbi.nlm.nih.gov"].includes(host)) throw new Error("PubMed 任务只能读取 NCBI 官方文章");
      if (target === "nbs" && host !== "data.stats.gov.cn" && host !== "www.stats.gov.cn") throw new Error("国家统计局任务只能读取官方页面");
      if (target === "nbs" && new URL(canonical).pathname === "/") throw new Error("官方目录首页不能作为观测数据证据");
      if (target === "web" && (!task.supplemental || task.supplemental.purpose === "image")) throw new Error("先执行带用途和理由的补充搜索");
    }
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
        if (existing) Object.assign(existing, entry, { source: undefined, preview: undefined, raw_path: undefined, rendered_path: undefined, reader: undefined, redirect_chain: undefined, diagnostics: undefined, content_scope: undefined, feedback: undefined, acquisition: undefined, content_hash: undefined }); else state.sources.push(entry);
      });
      try {
        signal?.throwIfAborted();
        const found = loader ? await loader() : await this.network.fetch(this.project.id, canonical, signal);
        signal?.throwIfAborted();
        let entry!: CollectedSource;
        await updateProgress(this.project, this.scope, state => {
          entry = state.sources.find(s => s.id === id)!;
          const { document, preview, raw_path, rendered_path, reader, redirect_chain, diagnostics, quality, content_scope, acquisition, ...source } = found;
          Object.assign(entry, { title: found.title, url: found.url, status: quality.status, reason: quality.reason, source, preview, raw_path, rendered_path, reader, redirect_chain, diagnostics, content_scope, acquisition, content_hash: hash(document), updated_at: now() });
        });
        return { entry, reused: false };
      } catch (error) {
        await updateProgress(this.project, this.scope, state => { const entry = state.sources.find(s => s.id === id)!; entry.status = "failed"; entry.reason = String(error); entry.feedback=researchFeedback(error,"fetch_datasets"); entry.updated_at = now(); }); throw error;
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
