import { designReferenceIssues } from "./design-validation.js";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Project, Design, DataFacts, Research, DesignIssue, DesignProgress } from "../../../packages/shared/types.js";
import { atomic, projectDir, safePath } from "./store.js";
import { hash, schemaErrors, schemas } from "./validation.js";
import { parseDocument, renderDocument } from "./markdown-protocol.js";
import { loadEvidenceSource } from "./evidence-view.js";
import type { RepairSnapshot } from "./analysis-repair-policy.js";

export function designIssues(design: Design, facts: DataFacts): DesignIssue[] {
  const errors = schemaErrors("design", design);
  const issues: DesignIssue[] = errors.map(error => {
    const parts = error.instancePath.split("/").slice(1), story = parts[0] === "storyline" ? design.storyline[Number(parts[1])]?.id : undefined;
    const component = parts[0] === "components" ? design.components[Number(parts[1])]?.id : undefined;
    return { story, component, location: component ? `组件 ${component}／${parts.slice(2).join("／") || "字段"}` : story ? `段落 ${story}／${parts.slice(2).join("／") || "字段"}` : `设计／${parts.join("／") || "文档"}`, message: `${error.message} (${JSON.stringify(error.params)})`, fix: "按设计 Markdown 模板补齐字段、选材与顺序理由或修正字段值" };
  });
  issues.push(...designReferenceIssues(design, facts));
  return issues;
}
const cell = (s: string) => s.replaceAll("|", "\\|").replace(/\r?\n/g, " ");
function report(issues: DesignIssue[]) { return "# 叙事设计草稿校验\n\n" + (issues.length ? `待修 ${issues.length} 项；草稿已保存，尚未正式提交。\n\n| 位置 | 问题 | 修正要求 |\n| --- | --- | --- |\n` + issues.map(issue => `| ${cell(issue.location)} | ${cell(issue.message)} | ${cell(issue.fix)} |`).join("\n") : "预检通过，尚未正式提交；请用当前 draft_revision 正式提交。") + "\n"; }
interface Draft { revision: string; markdown: string; parsed?: ReturnType<typeof parseDocument>; issues: DesignIssue[]; }
export class DesignerWorkbench {
  private queue: Promise<unknown> = Promise.resolve();
  private constructor(private p: Project, private facts: DataFacts, readonly scope: string, private research: Research, private sourceHash: string) {}
  private async refresh() {
    const digests = await Promise.all(this.research.sources.map(async source => [source.id, (await loadEvidenceSource(this.p, source)).digest]));
    if (hash(digests) !== this.sourceHash) throw new Error("设计来源内容已变化，不能继续使用旧范围草稿；请重新启动 Designer");
  }
  static async open(p: Project, inputs: { datafacts?: DataFacts; research?: Research; intent?: unknown }) {
    if (!inputs.datafacts || !inputs.research || p.state.stages.analyst.status !== "completed") throw new Error("Designer 需要正式提交的数据事实与研究资料");
    const digests = await Promise.all(inputs.research.sources.map(async source => [source.id, (await loadEvidenceSource(p, source)).digest]));
    return new DesignerWorkbench(p, inputs.datafacts, hash(["design-draft-v1", schemas.design, p.brief, inputs.intent, inputs.research, inputs.datafacts, digests]), inputs.research, hash(digests));
  }
  private get directory() { return `state/drafts/designer/${this.scope}`; }
  private serial<T>(operation: () => Promise<T>) { const next = this.queue.then(operation); this.queue = next.catch(() => {}); return next; }
  private inspect(markdown: string) {
    try {
      const parsed = parseDocument("designer", markdown, { validateSchema: false });
      return { parsed, issues: designIssues(parsed.data, this.facts) };
    } catch (error) { return { issues: [{ location: "文档格式", message: String(error instanceof Error ? error.message : error), fix: "按 Markdown 设计模板修正结构，空列表写无；普通说明放在文末 ## 说明" }] }; }
  }
  private async current(): Promise<Draft | undefined> {
    await this.refresh();
    let revision: string;
    try { revision = JSON.parse(await readFile(await safePath(projectDir(this.p.id), `${this.directory}/current.json`), "utf8")).revision; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
    if (!/^[a-f0-9-]{36}$/.test(revision)) throw new Error("设计草稿版本无效");
    const base = `${this.directory}/revisions/${revision}`;
    const markdown = await readFile(await safePath(projectDir(this.p.id), `${base}/draft.md`), "utf8");
    const meta = JSON.parse(await readFile(await safePath(projectDir(this.p.id), `${base}/meta.json`), "utf8"));
    if (meta.digest !== hash(markdown)) throw new Error("设计草稿摘要不一致");
    return { revision, markdown, ...this.inspect(markdown) };
  }
  private async persist(markdown: string) {
    await this.refresh();
    if (!markdown.trim() || markdown.length > 2_000_000) throw new Error("设计草稿为空或超过 2MB");
    const draft = { revision: randomUUID(), markdown, ...this.inspect(markdown) }, base = path.join(projectDir(this.p.id), this.directory, "revisions", draft.revision);
    await atomic(path.join(base, "draft.md"), markdown);
    await atomic(path.join(base, "validation.md"), report(draft.issues));
    await atomic(path.join(base, "meta.json"), JSON.stringify({ digest: hash(markdown) }));
    await atomic(path.join(projectDir(this.p.id), this.directory, "current.json"), JSON.stringify({ revision: draft.revision }));
    return draft;
  }
  private description(draft: Draft) { return `草稿版本：${draft.revision}\n草稿文件：${this.directory}/revisions/${draft.revision}/draft.md\n\n${report(draft.issues)}`; }
  async readDraft(select: { story_id?: string; component_id?: string } = {}) {
    if (select.story_id && select.component_id) throw new Error("每次仅指定 story_id 或 component_id");
    const draft = await this.current();
    if (!draft) return "尚无当前范围的叙事草稿。先按模板保存设计，未规划的故事线/组件列表显式写无；分批补齐。";
    const id = select.story_id ?? select.component_id;
    if (!id) return this.description(draft) + "\n\n" + draft.markdown;
    if (!draft.parsed) throw new Error("草稿结构不可解析，先读取完整 Markdown 并修复结构");
    const field = select.component_id ? "components" : "storyline";
    const index = (draft.parsed.data as Design)[field].findIndex(item => item.id === id);
    if (index < 0) throw new Error(`草稿中没有${field === "components" ? "组件" : "段落"} ${id}`);
    const section = this.sections(draft.markdown, field).items[index];
    return this.description(draft) + "\n\n" + draft.markdown.slice(section.start, section.end);
  }
  async saveDraft(markdown: string, revision?: string) { return this.serial(async () => {
    const prior = await this.current();
    if (prior && prior.revision !== revision) throw new Error("设计草稿版本已变化，请先 read_design_draft");
    return this.description(await this.persist(markdown));
  }); }
  private sections(markdown: string, field: "storyline" | "components" = "storyline") {
    const name = field === "storyline" ? "故事线|storyline" : "组件|components";
    const start = new RegExp(`^##\\s+(?:${name})[ \\t]*#*[ \\t]*\\r?$`, "m").exec(markdown);
    if (!start) throw new Error(`缺少${field === "storyline" ? "故事线" : "组件"}章节`);
    const content = start.index + start[0].length;
    const next = /^##\s+/m.exec(markdown.slice(content));
    const end = next ? content + next.index : markdown.length;
    const matches = [...markdown.slice(content, end).matchAll(/^###\s+条目\s+\d+[ \t]*#*[ \t]*$/gm)];
    return { content, end, items: matches.map((match, i) => ({ start: content + match.index!, end: i + 1 < matches.length ? content + matches[i + 1].index! : end })) };
  }
  async patchStory(revision: string, id: string, markdown: string) { return this.patchItem(revision, id, markdown, "storyline"); }
  async patchComponent(revision: string, id: string, markdown: string) { return this.patchItem(revision, id, markdown, "components"); }
  private async patchItem(revision: string, id: string, markdown: string, field: "storyline" | "components") { return this.serial(async () => {
    const prior = await this.current();
    if (!prior?.parsed || prior.revision !== revision) throw new Error("设计草稿版本已变化或结构不可解析，请先读取并修复完整草稿");
    if (field === "storyline" && /^\|\s*(?:类型|type)\s*\|/m.test(markdown)) throw new Error("patch_design_story 仅修正叙事段落；当前内容含组件类型，请改用 patch_design_component 并提供 component_id，先用 read_design_draft 的 component_id 读取目标组件");
    if (field === "components" && /^\|\s*(?:选材与顺序理由|rationale)\s*\|/m.test(markdown)) throw new Error("patch_design_component 仅修正视觉组件；叙事段落请使用 patch_design_story 和 story_id");
    const data = prior.parsed.data as Design, title = field === "storyline" ? "故事线" : "组件";
    const wrapper = renderDocument("designer", { ...data, [field]: [] }).replace(`## ${title}\n\n无\n\n`, `## ${title}\n\n${markdown}\n\n`);
    const patch = parseDocument("designer", wrapper, { validateSchema: false });
    if (patch.data[field].length !== 1 || patch.data[field][0].id !== id || patch.notes) throw new Error(`局部修改仅提供一个完整 ### 条目 N ${title}，保持编号，不附加说明或其他章节`);
    if (hash({ ...patch.data, [field]: [] }) !== hash({ ...data, [field]: [] })) throw new Error(`局部${title}修改不能改变其他设计字段`);
    const sections = this.sections(prior.markdown, field), index = data[field].findIndex(item => item.id === id), section = sections.items[index];
    const number = index < 0 ? data[field].length + 1 : index + 1;
    const replacement = markdown.trim().replace(/^###\s+条目\s+\d+/, `### 条目 ${number}`) + "\n\n";
    const updated = section ? prior.markdown.slice(0, section.start) + replacement + prior.markdown.slice(section.end) : prior.markdown.slice(0, sections.content) + "\n\n" + (sections.items.length ? prior.markdown.slice(sections.content, sections.end).trim() + "\n\n" : "") + replacement + prior.markdown.slice(sections.end);
    return this.description(await this.persist(updated));
  }); }
  async reorderStories(revision: string, ids: string[]) { return this.serial(async () => {
    const prior = await this.current();
    if (!prior?.parsed || prior.revision !== revision) throw new Error("设计草稿版本已变化或结构不可解析");
    const stories = (prior.parsed.data as Design).storyline;
    if (new Set(ids).size !== stories.length || ids.length !== stories.length || stories.some(story => !ids.includes(story.id))) throw new Error("排序必须完整保留所有已有段落编号，不重复、不删除");
    const sections = this.sections(prior.markdown);
    const ordered = ids.map((id, i) => { const section = sections.items[stories.findIndex(story => story.id === id)]; return prior.markdown.slice(section.start, section.end).trim().replace(/^###\s+条目\s+\d+/, `### 条目 ${i + 1}`); }).join("\n\n");
    return this.description(await this.persist(prior.markdown.slice(0, sections.content) + "\n\n" + ordered + "\n\n" + prior.markdown.slice(sections.end)));
  }); }
  async repairSnapshot(): Promise<RepairSnapshot | undefined> {
    const draft = await this.current(); if (!draft) return undefined;
    const design = draft.parsed?.data as Design | undefined;
    const items = [...(design?.storyline ?? []).map(story => ({ id: `story:${story.id}`, valid: !draft.issues.some(issue => issue.story === story.id) })), ...(design?.components ?? []).map(component => ({ id: `component:${component.id}`, valid: !draft.issues.some(issue => issue.component === component.id) }))];
    return { parsed: !!draft.parsed, factIds: items.map(item => item.id), verified: items.filter(item => item.valid).map(item => item.id), issues: draft.issues.map(issue => ({ ...issue, fact: issue.component ? `component:${issue.component}` : issue.story ? `story:${issue.story}` : undefined })) };
  }
  async submit(markdown?: string, revision?: string) { return this.serial(async () => {
    const prior = await this.current();
    if (revision && prior?.revision !== revision) throw new Error("提交的设计草稿版本已变化");
    if (!markdown && !revision) throw new Error("提交设计需 markdown 或 draft_revision");
    const draft = markdown === undefined ? prior! : await this.persist(markdown);
    if (draft.issues.length || !draft.parsed) throw new Error(this.description(draft));
    return draft.parsed;
  }); }
  async document(format: "draft" | "validation", revision: string) { const draft = await this.current(); return draft?.revision === revision ? format === "draft" ? draft.markdown : report(draft.issues) : undefined; }
  async progress(): Promise<DesignProgress> {
    const draft = await this.current();
    if (!draft) {
      const scopes = await readdir(path.join(projectDir(this.p.id), "state/drafts/designer")).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return []; throw error; });
      for (const scope of scopes.filter(value => /^[a-f0-9]{64}$/.test(value) && value !== this.scope)) {
        try { await safePath(projectDir(this.p.id), `state/drafts/designer/${scope}/current.json`); return emptyDesignProgress("stale", "需求、事实或资料已变化，旧设计草稿已失效，等待当前范围的新草稿。"); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      }
      return emptyDesignProgress();
    }
    const design = draft.parsed?.data as Design | undefined;
    return { status: "draft", revision: draft.revision, updated_at: (await stat(await safePath(projectDir(this.p.id), `${this.directory}/revisions/${draft.revision}/draft.md`))).mtime.toISOString(), phase: !draft.issues.length ? "ready" : design?.components.length ? "visual" : "narrative", design, notes: draft.parsed?.notes, issues: draft.issues, counts: { stories: design?.storyline.length ?? 0, selected_facts: new Set(design?.storyline.flatMap(story => story.fact_ids).filter(id => this.facts.facts.some(fact => fact.id === id))).size, components: design?.components.length ?? 0, verified_stories: design?.storyline.filter(story => !draft.issues.some(issue => issue.story === story.id)).length ?? 0 }, message: "已保存的设计草稿，尚未正式提交；预检只检查结构和引用，不证明叙事判断正确。" };
  }
}
export function emptyDesignProgress(status: DesignProgress["status"] = "empty", message = "Designer 保存草稿后，故事线、事实选用与视觉规划会在这里更新。" ): DesignProgress { return { status, phase: "narrative", issues: [], counts: { stories: 0, selected_facts: 0, components: 0, verified_stories: 0 }, message }; }
export async function readDesignProgress(p: Project, inputs: { datafacts?: DataFacts; research?: Research; intent?: unknown }) {
  if (!inputs.datafacts || p.state.stages.analyst.status !== "completed" || p.state.stages.designer.status === "completed") return undefined;
  try { return await (await DesignerWorkbench.open(p, inputs)).progress(); }
  catch (error) { return emptyDesignProgress("unavailable", `设计草稿暂时无法核验：${String(error instanceof Error ? error.message : error)}`); }
}
