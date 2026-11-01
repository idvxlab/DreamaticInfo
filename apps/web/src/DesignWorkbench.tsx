import CompositionPlan from "./CompositionPlan";
import { useId, useRef, useState } from "react";
import { ArrowUpRight, Check, ChevronDown, ChevronRight, FileText, Layers, Loader2, TriangleAlert } from "lucide-react";
import type { DesignIssue, ProjectDetail } from "../../../packages/shared/types";
import DesignEvidenceDrawer, { type EvidenceSelection } from "./DesignEvidenceDrawer";
import DesignVisualPlan, { componentGroup } from "./DesignVisualPlan";

type View = "narrative" | "visual" | "checks";
const views: { id: View; label: string }[] = [{ id: "narrative", label: "叙事编排" }, { id: "visual", label: "视觉方案" }, { id: "checks", label: "检查" }];
const relations = new Map([["temporal", "时间关系"], ["comparison", "比较"], ["correlation", "关联"], ["causal", "因果"], ["contains", "包含"], ["context", "背景"]]);

export default function DesignWorkbench({ project, onLocateFact }: { project: ProjectDetail; onLocateFact: (id: string) => void }) {
  const [view, setView] = useState<View>("narrative"), [storyId, setStoryId] = useState<string | null>(null);
  const [componentId, setComponentId] = useState<string | null>(null), [group, setGroup] = useState("all");
  const [drawer, setDrawer] = useState<EvidenceSelection | null>(null), [checkFilter, setCheckFilter] = useState("all"), [checkFocus, setCheckFocus] = useState<{ kind: "story" | "component"; id: string } | null>(null);
  const root = useRef<HTMLElement>(null), prefix = useId();
  const progress = project.design_progress, draft = !project.design;
  const design = project.design ?? (progress?.status === "draft" ? progress.design : undefined);
  const stage = project.state.stages.designer, running = stage.status === "running";
  const facts = project.datafacts?.facts ?? [], stories = design?.storyline ?? [];
  const active = stories.find(story => story.id === storyId) ?? stories[0];
  const selectedIds = new Set(stories.flatMap(story => story.fact_ids));
  const issues = draft && progress?.status === "draft" ? progress.issues : [];
  const activeIds = new Set(active?.fact_ids ?? []);
  const edges = facts.filter(fact => activeIds.has(fact.id)).flatMap(fact => fact.relations.map(edge => ({ ...edge, from: fact.id })));
  const visibleIssues = issues.filter(issue => (!checkFocus || (checkFocus.kind === "component" ? issue.component : issue.story) === checkFocus.id) && (checkFilter === "all" || (checkFilter === "component" ? !!issue.component : checkFilter === "story" ? !!issue.story : !issue.story && !issue.component)));
  const status = !draft ? "正式设计已提交，可用于作品实现" : running ? "Designer 正在设计，已保存内容自动更新" : stage.status === "failed" || stage.status === "interrupted" ? "设计已停止，草稿已保留，可从对话面板继续" : "等待保存叙事设计";
  const validGroup = ["all", "global", "unassigned", ...stories.map(story => `story:${story.id}`)].includes(group) ? group : "all";
  const documentUrl = !draft ? `/api/projects/${project.id}/document/design.md` : progress?.status === "draft" && progress.revision ? `/api/projects/${project.id}/design/draft?revision=${encodeURIComponent(progress.revision)}` : undefined;
  const openFacts = (ids: string[], title = "事实与证据") => setDrawer({ ids, title });
  const chooseView = (next: View) => { setView(next); if (next === "checks") { setCheckFocus(null); setCheckFilter("all"); } };
  const locateIssue = (issue: DesignIssue) => {
    if (issue.component && design) {
      const component = design.components.find(item => item.id === issue.component);
      if (!component) return;
      setView("visual"); setComponentId(component.id); setGroup(componentGroup(design, component));
      requestAnimationFrame(() => { const row = document.getElementById(`${prefix}-component-${design.components.indexOf(component)}`); row?.scrollIntoView({ block: "nearest" }); row?.querySelector("button")?.focus({ preventScroll: true }); });
    } else if (issue.story && stories.some(story => story.id === issue.story)) {
      setView("narrative"); setStoryId(issue.story);
      requestAnimationFrame(() => document.getElementById(`${prefix}-story-title`)?.focus({ preventScroll: true }));
    } else if (design) setView("visual");
  };
  const empty = !design && <div className="dw-empty"><FileText size={26} /><h3>{running ? "正在构思故事结构" : "等待叙事草稿"}</h3><p>{progress?.status === "draft" ? "草稿结构暂不可解析，已保存的 Markdown 和待修清单仍可查看。" : "Designer 保存后，故事段落、支撑事实和视觉方案会在这里更新。"}</p>{issues.length > 0 && <button type="button" className="dw-text-button" onClick={() => chooseView("checks")}>查看 {issues.length} 项待修问题<ChevronRight size={13} /></button>}</div>;

  return <section className="design-workbench" ref={root} aria-label="逻辑与叙事工作台">
    <header className="dw-header"><div className="dw-heading-line"><h2>逻辑与叙事</h2>{design && <span className="dw-status-badge">{draft ? "草稿" : "正式方案"}</span>}{documentUrl && <a className="dw-document-link" href={documentUrl} target="_blank" rel="noreferrer"><FileText size={13} />{draft ? "草稿文档" : "设计文档"}<ArrowUpRight size={11} /></a>}</div>
      {design && <p className="dw-design-title">{design.title}</p>}
      <div className="dw-status-line" role="status" aria-live="polite">{running ? <Loader2 size={12} className="spin" /> : <FileText size={12} />}<span>{status}</span>{draft && progress?.updated_at && <time dateTime={progress.updated_at}>保存于 {new Date(progress.updated_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>}</div>
      {design && <div className="dw-overview-counts"><span>{stories.length} 个段落</span><span>{[...selectedIds].filter(id => facts.some(fact => fact.id === id)).length} / {facts.length} 条事实已选用</span><span>{design.components.length} 个视觉组件</span><button type="button" className="dw-text-button" onClick={() => setDrawer({ ids: [], library: true, title: "事实选用" })}><Layers size={12} />查看事实</button></div>}
    </header>
    {design && <CompositionPlan design={design} />}
    <div className="dw-view-tabs" role="tablist" aria-label="叙事工作视图">{views.map((item, index) => <button type="button" key={item.id} id={`${prefix}-tab-${item.id}`} role="tab" aria-selected={view === item.id} aria-controls={`${prefix}-panel`} tabIndex={view === item.id ? 0 : -1} onClick={() => chooseView(item.id)} onKeyDown={event => {
      const next = event.key === "ArrowRight" ? (index + 1) % views.length : event.key === "ArrowLeft" ? (index + views.length - 1) % views.length : event.key === "Home" ? 0 : event.key === "End" ? views.length - 1 : -1;
      if (next >= 0) { event.preventDefault(); chooseView(views[next].id); document.getElementById(`${prefix}-tab-${views[next].id}`)?.focus(); }
    }}>{item.label}{item.id === "checks" && <span className={issues.length ? "dw-tab-count has-issues" : "dw-tab-count"}>{issues.length}</span>}</button>)}</div>
    {draft && (progress?.status === "stale" || progress?.status === "unavailable") ? <div className="dw-empty" role="status"><TriangleAlert size={26} /><h3>{progress.status === "stale" ? "旧设计草稿已失效" : "设计草稿暂时无法核验"}</h3><p>{progress.message}</p></div> : <div id={`${prefix}-panel`} role="tabpanel" aria-labelledby={`${prefix}-tab-${view}`} className="dw-view-panel">
      {view === "narrative" && (design ? <>
        <details className="dw-mainline"><summary><span><small>整体主线</small>{design.theme || "查看整体编排依据"}</span><ChevronDown size={14} /></summary><p>{design.narrative_rationale || "整体编排依据尚未填写。"}</p></details>
        <div className="dw-story-selector"><label htmlFor={`${prefix}-story-select`}>当前段落</label><select id={`${prefix}-story-select`} aria-label="选择叙事段落" value={active?.id ?? ""} onChange={event => setStoryId(event.target.value)}>{stories.map((story, index) => <option key={`${story.id}-${index}`} value={story.id}>{String(index + 1).padStart(2, "0")}　{story.title}</option>)}</select></div>
        <div className="dw-master-detail"><nav className="dw-story-list" aria-label="故事阅读顺序"><div className="dw-directory-heading">故事线<span>{stories.length} 段</span></div>{stories.map((story, index) => <button type="button" key={`${story.id}-${index}`} aria-pressed={story.id === active?.id} onClick={() => setStoryId(story.id)}><span className="dw-story-number">{String(index + 1).padStart(2, "0")}</span><span className="dw-story-label"><strong>{story.title}</strong><small>{story.fact_ids.length} 条支撑事实{issues.some(issue => issue.story === story.id) && <span className="dw-warning"> · 待修正</span>}</small></span></button>)}</nav>
        {active ? <article className="dw-story-detail" aria-label="当前叙事段落"><header><small>第 {stories.indexOf(active) + 1} 段</small><h3 id={`${prefix}-story-title`} tabIndex={-1}>{active.title}</h3></header><p className="dw-story-description">{active.description || "该段内容尚待补充。"}</p>
          {issues.some(issue => issue.story === active.id) && <button type="button" className="dw-text-button dw-warning" onClick={() => { setCheckFocus({ kind: "story", id: active.id }); setCheckFilter("all"); setView("checks"); }}>此段有 {issues.filter(issue => issue.story === active.id).length} 项待修问题，查看检查清单</button>}
          <section className="dw-supporting-facts"><div className="dw-section-heading"><h4>支撑事实</h4><span>{active.fact_ids.length} 条</span></div><div className="dw-compact-facts">{active.fact_ids.map(id => { const fact = facts.find(item => item.id === id); return <button type="button" key={id} onClick={() => openFacts([id])}><span><strong>{fact?.title ?? `未知事实 ${id}`}</strong><small>{fact?.source_ids.map(sourceId => project.research?.sources.find(source => source.id === sourceId)?.title ?? sourceId).join("、") || id}</small></span><span className="dw-fact-result">{fact ? `${fact.value} ${fact.unit}` : "待修"}<ChevronRight size={13} /></span></button>; })}</div>{!active.fact_ids.length && <p className="dw-muted">此段尚未选用事实，不能视为有数据支撑的结论。</p>}</section>
          <details key={active.id} className="dw-story-reason"><summary>选材与顺序理由<ChevronDown size={14} /></summary><p>{active.rationale || "编排理由尚未填写。"}</p></details>
          <details key={`relations-${active.id}`} className="dw-story-relations"><summary>事实之间的关联<span>{edges.length}</span><ChevronDown size={14} /></summary>{edges.map((edge, index) => <button type="button" key={index} onClick={() => openFacts([edge.from, edge.target_id], "关联两端的事实与证据")}><strong>{facts.find(fact => fact.id === edge.from)?.title ?? edge.from} <span>{relations.get(edge.type) ?? edge.type}</span> {facts.find(fact => fact.id === edge.target_id)?.title ?? edge.target_id}</strong><p>{edge.basis}</p>{!activeIds.has(edge.target_id) && <small>关联到本段之外的事实</small>}<small>查看两端证据<ArrowUpRight size={11} /></small></button>)}{!edges.length && <p className="dw-muted">Analyst 尚未记录这些事实之间的显式关系。共同选用不代表因果关系。</p>}</details>
          <footer className="dw-story-footer"><small>{active.id}</small><button type="button" className="dw-text-button" onClick={() => { setGroup(`story:${active.id}`); setComponentId(null); setView("visual"); }}>查看这一段的视觉方案<ChevronRight size={12} /></button></footer>
        </article> : <div className="dw-empty-note">故事线尚未保存，请等待 Designer 补充段落。</div>}</div>
      </> : empty)}
      {view === "visual" && (design ? <DesignVisualPlan design={design} issues={issues} facts={facts} group={validGroup} selected={componentId} prefix={prefix} onGroup={setGroup} onSelect={setComponentId} onFacts={ids => openFacts(ids)} onCheck={() => { setCheckFocus(componentId ? { kind: "component", id: componentId } : null); setCheckFilter("all"); setView("checks"); }} /> : empty)}
      {view === "checks" && <section className="dw-checks" aria-label="设计检查清单"><div className="dw-section-heading"><div><h3>检查与修正</h3><p>{issues.length ? `${issues.length} 项问题需要修正，定位后可查看相应段落或组件。` : design ? draft ? "当前预检通过，等待 Designer 正式提交。" : "正式方案已通过结构与引用校验。" : "草稿保存后将在这里显示校验结果。"}</p></div><select aria-label="筛选问题范围" value={checkFilter} onChange={event => setCheckFilter(event.target.value)}><option value="all">全部问题</option><option value="story">叙事段落</option><option value="component">视觉组件</option><option value="document">整体文档</option></select></div>
        {checkFocus && <p className="dw-check-focus">当前仅查看{checkFocus.kind === "component" ? "组件" : "段落"} {checkFocus.id}<button type="button" className="dw-text-button" onClick={() => setCheckFocus(null)}>查看全部问题</button></p>}
        {visibleIssues.length > 0 ? <div className="dw-table-scroll"><table className="dw-check-table"><thead><tr><th>位置</th><th>问题与修正要求</th><th>操作</th></tr></thead><tbody>{visibleIssues.map((issue, index) => <tr key={index}><td><strong>{issue.component ? design?.components.find(item => item.id === issue.component)?.title ?? issue.component : issue.story ? stories.find(story => story.id === issue.story)?.title ?? issue.story : "整体文档"}</strong><small>{issue.location}</small></td><td><p>{issue.message}</p><details><summary>修正要求</summary><p>{issue.fix}</p></details></td><td>{(issue.component || issue.story || design) ? <button type="button" className="dw-text-button" onClick={() => locateIssue(issue)}>{issue.component ? "定位组件" : issue.story ? "定位段落" : "查看方案"}<ChevronRight size={12} /></button> : documentUrl && <a href={documentUrl} target="_blank" rel="noreferrer">查看草稿</a>}</td></tr>)}</tbody></table></div> : <div className="dw-check-empty"><Check size={23} /><p>{issues.length ? "当前筛选范围没有待修问题。" : design ? "没有待修问题" : "等待设计草稿"}</p></div>}
        <div className="dw-check-documents">{documentUrl && <a href={documentUrl} target="_blank" rel="noreferrer"><FileText size={13} />{draft ? "草稿 Markdown" : "正式设计文档"}</a>}{draft && progress?.revision && <a href={`/api/projects/${project.id}/design/validation?revision=${encodeURIComponent(progress.revision)}`} target="_blank" rel="noreferrer">完整校验清单<ArrowUpRight size={11} /></a>}</div><p className="dw-muted">预检检查格式、引用与映射；叙事判断仍需结合原文核实。草稿正式提交后才会交给 Builder。</p>
      </section>}
    </div>}
    {design && view === "visual" && <details className="dw-advanced dw-design-documents"><summary>设计说明与交接文档</summary>{(draft ? progress?.notes : project.stage_results?.designer?.notes) && <p>{draft ? progress?.notes : project.stage_results?.designer?.notes}</p>}<div className="dw-check-documents">{(["intent", "research", "datafacts", "design"] as const).filter(name => !!project[name]).map(name => <a href={`/api/projects/${project.id}/document/${name}.md`} target="_blank" rel="noreferrer" key={name}>{name}.md<ArrowUpRight size={11} /></a>)}</div></details>}
    {design && drawer && <DesignEvidenceDrawer project={project} selection={drawer} selectedIds={selectedIds} anchor={root.current?.closest<HTMLElement>(".canvas-content") ?? null} onClose={() => setDrawer(null)} onLocateFact={id => { setDrawer(null); onLocateFact(id); }} />}
  </section>;
}
