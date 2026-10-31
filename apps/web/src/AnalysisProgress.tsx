import { useEffect, useState } from "react";
import { ArrowUpRight, Check, FileText, Loader2, TriangleAlert } from "lucide-react";
import type { AnalysisIssue, AnalysisProgress as Progress, ProjectDetail } from "../../../packages/shared/types";
import FactCard from "./FactCard";
function Issues({ issues }: { issues: AnalysisIssue[] }) {
  return <ul className="analysis-issues">{issues.map((issue, index) => <li key={index}><strong>{issue.location}</strong><p>{issue.message}</p><p className="analysis-fix">修正要求：{issue.fix}</p></li>)}</ul>;
}
export default function AnalysisProgress({ project, progress }: { project: ProjectDetail; progress?: Progress }) {
  const [linked, setLinked] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "needs_revision">("all");
  const stage = project.state.stages.analyst;
  const running = stage.status === "running";
  const entries = progress?.facts ?? [];
  useEffect(() => { if (linked && !entries.some(entry => entry.fact.id === linked)) setLinked(null); }, [linked, entries]);
  if (!progress || progress.status !== "draft") return <section className={`analysis-empty ${progress?.status ?? "empty"}`} role="status">
    {running ? <Loader2 size={23} className="spin" /> : progress?.status === "stale" || progress?.status === "unavailable" ? <TriangleAlert size={23} /> : <FileText size={23} />}
    <h3>{progress?.status === "stale" ? "旧草稿已失效" : progress?.status === "unavailable" ? "草稿暂时无法展示" : running ? "正在提取数据事实…" : stage.status === "failed" || stage.status === "interrupted" ? "等待继续事实提取" : "等待事实草稿"}</h3>
    <p>{progress?.message || "完成需求与调研后，Analyst 保存的事实草稿会逐条出现在这里。"}</p>
    {(stage.status === "failed" || stage.status === "interrupted") && <p>可从对话面板继续执行。</p>}
  </section>;
  const counts = progress.counts;
  const globalIssues = progress.issues.filter(issue => !issue.fact);
  const facts = entries.map(entry => entry.fact);
  const selected = entries.filter(entry => (filter === "all" || entry.status === "needs_revision") && (!linked || entry.fact.id === linked || facts.find(fact => fact.id === linked)?.relations.some(relation => relation.target_id === entry.fact.id)));
  const base = `/api/projects/${project.id}/analysis`;
  return <section className="analysis-progress" aria-label="事实提取中间成果">
    <header className="analysis-progress-heading"><div><p className="eyebrow">ANALYSIS IN PROGRESS</p><h3>分析草稿 <span>尚未正式提交</span></h3><p>{progress.message}</p><p className="analysis-stage-status" role="status">{running ? <Loader2 size={12} className="spin" /> : <FileText size={12} />}{running ? "正在提取与校验，已保存内容会自动更新" : stage.status === "failed" ? "分析已停止，已保存草稿保留，可继续修正" : stage.status === "interrupted" ? stage.error === "用户暂停任务" ? "分析已暂停，已保存草稿保留，可继续执行" : "分析已中断，已保存草稿保留，可继续执行" : "草稿已保存，等待继续分析"}{progress.updated_at && <time dateTime={progress.updated_at}>最近保存 {new Date(progress.updated_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>}</p></div></header>
    <div className="analysis-counts" aria-label="草稿校验进展"><span><strong>{counts.saved}</strong>已保存事实</span><span className="verified"><strong>{counts.verified}</strong>校验通过</span><span className="needs_revision"><strong>{counts.needs_revision}</strong>待修正事实</span><span><strong>{progress.issues.length}</strong>校验问题</span></div>
    {progress.summary && <p className="analysis-summary">{progress.summary}</p>}
    <div className="analysis-controls"><div className="analysis-filters" aria-label="事实草稿筛选"><button type="button" aria-pressed={filter === "all"} onClick={() => { setFilter("all"); setLinked(null); }}>全部草稿</button><button type="button" aria-pressed={filter === "needs_revision"} onClick={() => { setFilter("needs_revision"); setLinked(null); }}>仅看待修正</button>{linked && <button type="button" onClick={() => setLinked(null)}>取消关联筛选</button>}</div><div className="source-links"><a href={`${base}/draft?revision=${progress.revision}`} target="_blank" rel="noreferrer">查看草稿 Markdown<ArrowUpRight size={12} /></a><a href={`${base}/validation?revision=${progress.revision}`} target="_blank" rel="noreferrer">完整校验清单<ArrowUpRight size={12} /></a></div></div>
    {globalIssues.length > 0 && <section className="analysis-global-issues" aria-label="文档级校验问题"><h4><TriangleAlert size={14} />文档结构与整体问题</h4><Issues issues={globalIssues} />{!entries.length && <p>草稿结构尚不可解析，可查看已保存的 Markdown；修复后才能展示事实卡片。</p>}</section>}
    {entries.length > 0 && <div className="facts-grid">{selected.map((entry, index) => <section className={`analysis-draft-item ${entry.status}`} key={entry.key} aria-label={`草稿 ${entry.fact.id}`}><div className="analysis-fact-status"><span>{entry.status === "verified" ? <Check size={12} /> : <TriangleAlert size={12} />}{entry.status === "verified" ? "草稿 · 校验通过" : "草稿 · 待修正"}</span><small>{entry.fact.id}</small></div><FactCard fact={entry.fact} index={index} project={project} draft relatedFacts={facts} linked={linked === entry.fact.id} onLink={() => setLinked(linked === entry.fact.id ? null : entry.fact.id)} />{entry.issues.length > 0 && <details className="analysis-fact-issues" open><summary>待修正问题 · {entry.issues.length}</summary><Issues issues={entry.issues} /></details>}{entry.status === "needs_revision" && !entry.issues.length && <p className="analysis-global-note">需先修正文档级问题，暂未计为通过。</p>}</section>)}</div>}
    {entries.length > 0 && selected.length === 0 && <p className="analysis-no-matches" role="status">当前筛选下没有事实草稿。</p>}
  </section>;
}
