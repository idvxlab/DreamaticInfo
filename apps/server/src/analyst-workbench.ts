import { saveCalculation, calculationMarkdown, type SourceCalculation } from "./source-calculation.js";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Project, Research, Fact, AnalysisProgress } from "../../../packages/shared/types.js";
import { atomic, projectDir, safePath } from "./store.js";
import { hash, schemas } from "./validation.js";
import { parseDocument } from "./markdown-protocol.js";
import { analystIssues, analysisReport, type AnalysisIssue } from "./analyst-validation.js";
import type { RepairSnapshot } from "./analysis-repair-policy.js";
import { EVIDENCE_VERSION, loadEvidenceSource, evidenceMarkdown, type EvidenceSource } from "./evidence-view.js";
export class AnalysisValidationError extends Error {
  readonly failureKey: string;
  constructor(readonly issues: AnalysisIssue[], report: string) { super(report); this.failureKey = hash(issues.map(issue => [issue.location, issue.message])); }
}
interface Inspection { parsed?: ReturnType<typeof parseDocument>; issues: AnalysisIssue[]; verified: string[]; report: string; }
interface Draft extends Inspection { markdown: string; revision: string; file: string; }
const cell = (value: string) => value.replaceAll("|", "\\|").replace(/\r?\n/g, " ");
export class AnalystWorkbench {
  private queue: Promise<unknown> = Promise.resolve();
  private constructor(private p: Project, private research: Research, private sources: Map<string, EvidenceSource>, readonly scope: string) {}
  static async open(p: Project, research: Research, intent?: unknown, options: { readOnly?: boolean } = {}) {
    const sources = new Map<string, EvidenceSource>();
    for (const source of research.sources) sources.set(source.id, await loadEvidenceSource(p, source));
    const scope = hash(["analyst-draft-v1", EVIDENCE_VERSION, schemas.datafacts, p.brief, intent, research, [...sources].map(([id, source]) => [id, source.digest])]);
    const work = new AnalystWorkbench(p, research, sources, scope);
    if (!options.readOnly) for (const source of sources.values()) await atomic(path.join(projectDir(p.id), work.directory, `evidence-${hash(source.source.id)}.md`), evidenceMarkdown(source));
    return work;
  }
  private get directory() { return `state/drafts/analyst/${this.scope}`; }
  private async refresh() {
    const sources = new Map<string, EvidenceSource>();
    for (const source of this.research.sources) {
      const current = await loadEvidenceSource(this.p, source);
      if (current.digest !== this.sources.get(source.id)?.digest) throw new Error("来源内容已变化，本草稿范围失效；请重新启动 Analyst，不能复用旧证据或验证结果");
      sources.set(source.id, current);
    }
    return sources;
  }
  private serialized<T>(operation: () => Promise<T>) {
    const result = this.queue.then(operation); this.queue = result.catch(() => {}); return result;
  }
  private async inspect(markdown: string): Promise<Inspection> {
    const evidence = await this.refresh();
    let parsed: ReturnType<typeof parseDocument>;
    try { parsed = parseDocument("analyst", markdown, { validateSchema: false }); }
    catch (error) {
      const issues = [{ location: "文档格式", message: String(error instanceof Error ? error.message : error), fix: "先修复 Markdown 结构，再校验事实、来源和证据" }];
      return { issues, verified: [], report: analysisReport(issues) };
    }
    const issues = await analystIssues(this.p, parsed.data, this.research, evidence);
    const global = issues.some(issue => !issue.fact);
    const verified = global ? [] : parsed.data.facts.filter((fact: any) => !issues.some(issue => issue.fact === fact.id)).map((fact: any) => fact.id) as string[];
    return { parsed, issues, verified, report: analysisReport(issues, verified) };
  }
  private async current(): Promise<Draft | undefined> {
    const root = projectDir(this.p.id), pointer = `${this.directory}/current.json`;
    let revision: string;
    try { revision = JSON.parse(await readFile(await safePath(root, pointer), "utf8")).revision; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
    if (!/^[a-f0-9-]{36}$/.test(revision)) throw new Error("草稿版本指针无效");
    const file = `${this.directory}/revisions/${revision}/draft.md`;
    const markdown = await readFile(await safePath(root, file), "utf8");
    const metadata = JSON.parse(await readFile(await safePath(root, `${this.directory}/revisions/${revision}/meta.json`), "utf8"));
    if (metadata.digest !== hash(markdown)) throw new Error("草稿内容摘要不一致，不能复用已修改的草稿");
    return { markdown, revision, file, ...await this.inspect(markdown) };
  }
  private async persist(markdown: string): Promise<Draft> {
    if (!markdown.trim() || markdown.length > 2_000_000) throw new Error("草稿为空或超过 2MB");
    const inspection = await this.inspect(markdown), revision = randomUUID();
    const directory = `${this.directory}/revisions/${revision}`, root = projectDir(this.p.id);
    await atomic(path.join(root, directory, "draft.md"), markdown);
    await atomic(path.join(root, directory, "validation.md"), inspection.report);
    await atomic(path.join(root, directory, "meta.json"), JSON.stringify({ digest: hash(markdown), verified: inspection.verified, scope: this.scope }));
    // Switch only after the complete immutable revision exists. Interrupted saves keep the previous revision.
    await atomic(path.join(root, this.directory, "current.json"), JSON.stringify({ revision }));
    return { ...inspection, markdown, revision, file: `${directory}/draft.md` };
  }
  private description(draft: Draft) { return `草稿版本：${draft.revision}\n草稿文件：${draft.file}\n\n${draft.report}`; }
  async repairSnapshot(): Promise<RepairSnapshot | undefined> {
    const draft = await this.current();
    return draft && { parsed: !!draft.parsed, factIds: (draft.parsed?.data.facts ?? []).map((fact: Fact) => fact.id), verified: draft.verified, issues: draft.issues };
  }
  async progress(): Promise<AnalysisProgress> {
    const draft = await this.current();
    if (!draft) {
      const empty = emptyAnalysisProgress();
      const scopes = await readdir(path.join(projectDir(this.p.id), "state/drafts/analyst")).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return []; throw error; });
      for (const scope of scopes.filter(scope => /^[a-f0-9]{64}$/.test(scope) && scope !== this.scope)) {
        try {
          await safePath(projectDir(this.p.id), `state/drafts/analyst/${scope}/current.json`);
          return { ...empty, status: "stale", message: "需求、研究资料或来源内容已变化，旧草稿已失效；等待 Analyst 保存当前范围的新草稿。" };
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      }
      return empty;
    }
    const globalIssues = draft.issues.filter(issue => !issue.fact);
    const facts = (draft.parsed?.data.facts ?? []).map((fact: Fact, index: number) => ({ key: `fact-${index}`, fact, status: !globalIssues.length && draft.verified.includes(fact.id) ? "verified" as const : "needs_revision" as const, issues: draft.issues.filter(issue => issue.fact === fact.id) }));
    const verified = facts.filter((fact: { status: string }) => fact.status === "verified").length;
    return { status: "draft", revision: draft.revision, updated_at: (await stat(await safePath(projectDir(this.p.id), draft.file))).mtime.toISOString(), summary: draft.parsed?.data.summary ?? "草稿结构尚未通过解析，请查看文档问题。", facts, issues: draft.issues, counts: { saved: facts.length, verified, needs_revision: facts.length - verified }, message: "分析草稿，尚未正式提交。校验通过仅表示格式、引用和证据检查通过，不代表统计结论已经核实。" };
  }
  async document(format: "draft" | "validation", revision: string) {
    const draft = await this.current();
    if (!draft || draft.revision !== revision) return undefined;
    return format === "draft" ? draft.markdown : draft.report;
  }
  async catalog() {
    return "# Analyst 来源目录\n\n编号必须原样复制，不创建 S-01 等别名。事实类型 value/comparison/trend/distribution/correlation/proportion/categorization/rank/extreme/outlier；依据方式 quoted/computed/inferred/forecast；关联类型 temporal/comparison/correlation/causal/contains/context。distribution 不能作为关联类型。\n\n| 来源编号 | 标题 | 原文件 | 内容摘要 | 局限 |\n| --- | --- | --- | --- | --- |\n" + [...this.sources.values()].map(source => `| ${cell(source.source.id)} | ${cell(source.source.title)} | ${cell(source.source.path)} | ${source.digest} | ${cell(source.source.limitations.join("；"))} |`).join("\n");
  }
  async calculate(input: SourceCalculation) {
    const sources = await this.refresh(), source = sources.get(input.source_id);
    if (!source) throw new Error("来源不在当前目录中");
    return calculationMarkdown(await saveCalculation(this.p, source, input));
  }
  async readEvidence(sourceId: string, query = "", offset = 0, limit = 8, blockId?: string) {
    const sources = await this.refresh(), source = sources.get(sourceId);
    if (!source) throw new Error("来源编号不在当前来源目录中，请先读取 read_source_catalog");
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error("offset 必须为非负整数，limit 为 1–20");
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const ranked = source.blocks.filter(block => !blockId || block.id === blockId).map((block, index) => ({ block, index, score: terms.filter(term => block.text.toLowerCase().includes(term)).length }));
    if (query) ranked.sort((a, b) => b.score - a.score || a.index - b.index);
    const blocks = ranked.slice(offset, offset + limit).map(item => item.block);
    return evidenceMarkdown(source, blocks) + `\n共 ${ranked.length} 块；本页 offset=${offset}，limit=${limit}。查询仅帮助排序，不改变证据匹配规则。证据较长时可直接读取完整视图：${this.directory}/evidence-${hash(sourceId)}.md\n`;
  }
  async readDraft(factId?: string) {
    const draft = await this.current();
    if (!draft) return "当前需求和来源范围没有草稿。先保存 Markdown 草稿，不要重复读取已经核对的资料。";
    if (!factId) return this.description(draft) + "\n\n使用 read_analysis_draft 指定 fact_id 读取单条事实；或用 read 按页读取草稿文件。局部修正调用 patch_analysis_fact；正式提交传 draft_revision，不必重写整份文档。";
    if (!draft.parsed) throw new Error("草稿格式无法解析，请先修复整份 Markdown 结构");
    const index = draft.parsed.data.facts.findIndex((fact: any) => fact.id === factId);
    if (index < 0) throw new Error("草稿中不存在该事实编号");
    return this.description(draft) + "\n\n" + this.sections(draft.markdown)[index].text;
  }
  private sections(markdown: string) {
    const end = /^## 说明[ \t]*$/m.exec(markdown)?.index ?? markdown.length;
    const body = markdown.slice(0, end), matches = [...body.matchAll(/^###\s+条目\s+\d+[ \t]*#*[ \t]*$/gm)];
    return matches.map((match, index) => { const start = match.index!, finish = matches[index + 1]?.index ?? end; return { start, finish, text: markdown.slice(start, finish) }; });
  }
  async saveDraft(markdown: string, baseRevision?: string) {
    return this.serialized(async () => {
      const prior = await this.current();
      if (prior && baseRevision !== prior.revision) throw new Error(`草稿版本已变化；先 read_analysis_draft，再使用当前版本 ${prior.revision}`);
      const draft = await this.persist(markdown);
      if (draft.issues.length) throw new AnalysisValidationError(draft.issues, this.description(draft));
      return this.description(draft);
    });
  }
  async patchFact(revision: string, factId: string, markdown: string) {
    return this.serialized(async () => {
      const prior = await this.current();
      if (!prior || prior.revision !== revision) throw new Error("草稿不存在或版本已变化，请先 read_analysis_draft");
      if (!prior.parsed) throw new Error("草稿格式无法解析，先使用 save_analysis_draft 修复整体格式");
      const wrapper = `# 数据事实报告\n\n| 字段 | 内容 |\n| --- | --- |\n| 概要 | 局部修复 |\n\n## 数据事实\n\n${markdown}\n\n## 说明\n`;
      const patch = parseDocument("analyst", wrapper, { validateSchema: false });
      if (patch.data.facts.length !== 1 || patch.data.facts[0].id !== factId || patch.notes) throw new Error("局部修正必须是一个 ### 条目 N 事实章节，且保留原事实编号，不附加说明章节");
      const index = prior.parsed.data.facts.findIndex((fact: any) => fact.id === factId);
      const section = this.sections(prior.markdown)[index];
      const end = /^## 说明[ \t]*$/m.exec(prior.markdown)?.index ?? prior.markdown.length;
      const number = index < 0 ? prior.parsed.data.facts.length + 1 : index + 1;
      const replacement = markdown.trim().replace(/^###\s+条目\s+\d+/, `### 条目 ${number}`) + "\n\n";
      const draft = await this.persist(prior.markdown.slice(0, section?.start ?? end) + replacement + prior.markdown.slice(section?.finish ?? end));
      // A successful local repair can leave unrelated issues pending without consuming another failed-submission slot.
      if (draft.issues.some(issue => !issue.fact || issue.fact === factId)) throw new AnalysisValidationError(draft.issues, this.description(draft));
      return this.description(draft);
    });
  }
  async submit(markdown?: string, revision?: string) {
    return this.serialized(async () => {
      const prior = await this.current();
      if (revision && (!prior || prior.revision !== revision)) throw new Error("提交的草稿版本已变化，请先 read_analysis_draft");
      if (markdown === undefined && !revision) throw new Error("提交需提供 markdown 或已保存的 draft_revision");
      const draft = markdown === undefined ? prior! : await this.persist(markdown);
      if (draft.issues.length || !draft.parsed) throw new AnalysisValidationError(draft.issues, this.description(draft));
      return draft.parsed;
    });
  }
}

export function emptyAnalysisProgress(): AnalysisProgress {
  return { status: "empty", summary: "", facts: [], issues: [], counts: { saved: 0, verified: 0, needs_revision: 0 }, message: "Analyst 尚未保存事实草稿。保存后会在这里逐条展示。" };
}
/** Read-only projection for polling; never writes evidence, drafts or formal artifacts. */
export async function readAnalysisProgress(p: Project, research?: Research, intent?: unknown): Promise<AnalysisProgress | undefined> {
  if (!research || p.state.stages.researcher.status !== "completed" || p.state.stages.analyst.status === "completed") return undefined;
  try {
    const work = await AnalystWorkbench.open(p, research, intent, { readOnly: true });
    return await work.progress();
  } catch (error) {
    return { ...emptyAnalysisProgress(), status: "unavailable", message: `草稿暂时无法核验，未展示旧验证结果：${error instanceof Error ? error.message : String(error)}` };
  }
}
