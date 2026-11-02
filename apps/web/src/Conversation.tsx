import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, ArrowUpRight, Bot, Check, ChevronDown, FileText, Loader2, Paperclip, Play, RotateCcw, Sparkles, Square, Wrench, X } from "lucide-react";
import { type ProjectDetail, type Role } from "../../../packages/shared/types";
import { conversationEntries, documentNames, pendingQuestion, roleLabels, roleNames, type ConversationEvent } from "./conversation-model";

interface Props {
  project: ProjectDetail | null;
  events: ConversationEvent[];
  text: string;
  setText: (text: string) => void;
  files: File[];
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
  disabled: boolean;
  pending: boolean;
  error: string;
  clearError: () => void;
  onSend: (text?: string) => Promise<void>;
  onPause: () => void;
  onContinue: () => void;
  onAddModelBudget?: (amount: number) => void;
  onRerun: (role: Role) => void;
  onPreview: () => void;
}
const statuses: Record<string, string> = { pending: "等待执行", running: "正在执行", completed: "已完成", failed: "执行失败", interrupted: "已中断" };
function time(value: string) { return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }); }

function modelProgress(project: ProjectDetail, role: Role) {
  const activity = project.model_activity;
  if (!activity || activity.role !== role) return undefined;
  const phases = { waiting: "等待模型响应", text: "模型正在生成文字", tool_arguments: "模型正在组织工具参数", processing: "模型正在处理请求", tool: "正在执行工具", finished: "模型已完成本次输出" };
  const elapsed = Math.max(0, Math.floor((Date.now() - Date.parse(activity.started_at)) / 1000));
  if (activity.phase === "tool") return `正在执行工具 · 本次执行 ${elapsed} 秒`;
  return `${phases[activity.phase]} · 本次调用 ${elapsed} 秒 · 已输出 ${activity.output_characters.toLocaleString()} 字符${project.analysis_progress?.counts.saved ? ` · 已保存 ${project.analysis_progress.counts.saved} 条事实` : ""}`;
}

function StageCard({ project, role, events, pending, onRerun }: { project: ProjectDetail; role: Role; events: ConversationEvent[]; pending: boolean; onRerun: () => void }) {
  const stage = project.state.stages[role], running = stage.status === "running";
  const [open, setOpen] = useState(running || stage.status === "failed");
  useEffect(() => { setOpen(running || stage.status === "failed"); }, [stage.status, running]);
  const result = project.stage_results?.[role];
  const actions = events.filter(event => event.role === role && (!stage.completed_at || stage.status !== "completed" || Date.parse(event.at) <= Date.parse(stage.completed_at)));
  const progressText = modelProgress(project, role) || actions.at(-1)?.text || "正在处理本阶段任务…";
  return <div className={`workflow-node workflow-agent-node ${stage.status}`}>
    <span className="workflow-dot">{running ? <Loader2 size={13} className="spin" /> : stage.status === "completed" ? <Check size={13} /> : <Bot size={13} />}</span>
    <details className="workflow-agent-card" open={open} onToggle={event => { if (event.target === event.currentTarget) setOpen(event.currentTarget.open); }}>
      <summary><span><strong>{roleNames[role]} · {roleLabels[role]}</strong><small title="启动次数包含首次执行、恢复执行、重新执行和自动重试，不代表文献读取次数。">{stage.status === "interrupted" && stage.error === "用户暂停任务" ? "已暂停" : statuses[stage.status]}{stage.attempts > 0 && ` · 第 ${stage.attempts} 次启动`}{stage.completed_at && stage.status === "completed" && ` · ${time(stage.completed_at)}`}</small>{running && <small className="workflow-progress-preview">{progressText}</small>}</span><ChevronDown size={14} /></summary>
      <div className="workflow-agent-body">
        {running && <section className="workflow-agent-progress" role="status"><h4><Loader2 size={11} className="spin" /> 当前进展</h4><p>{progressText}</p></section>}
        {actions.length > 0 && <details className="workflow-action-log"><summary>执行记录 · {actions.length}</summary><div className="nested-stream">{actions.map((event, i) => <div className="workflow-tool" key={`${event.at}-${i}`}><Wrench size={11} /><p>{event.text}</p><time>{time(event.at)}</time></div>)}</div></details>}
        {result && <><section className="workflow-result"><h4>阶段结果</h4><p>{result.summary || "本阶段已完成，正式产物已保存。"}</p></section>{result.notes && <details className="workflow-agent-output"><summary>智能体输出</summary><p>{result.notes}</p></details>}<div className="workflow-file-links">{["md"].map(ext => <a key={ext} href={`/api/projects/${project.id}/document/${documentNames[role]}.${ext}`} target="_blank" rel="noreferrer">{documentNames[role]}.{ext}<ArrowUpRight size={11} /></a>)}</div></>}
        {stage.error && !(pendingQuestion(project) && role === "chatbot") && <p className="workflow-error" role="alert">{stage.error}</p>}
        {stage.status === "completed" && <button type="button" className="stage-rerun" disabled={pending || project.state.status === "running"} onClick={onRerun}><RotateCcw size={11} />重新执行此阶段及下游</button>}
      </div>
    </details>
  </div>;
}

export default function Conversation(props: Props) {
  const { project, events, text, setText, files, setFiles, disabled, pending, error, clearError, onSend, onPause, onContinue, onRerun, onPreview } = props;
  const running = project?.state.status === "running";
  const budget = project?.state.execution_budget;
  const modelUsed = budget?.model ?? 0, modelLimit = budget?.model_task_limit ?? 120;
  const modelExhausted = !!budget && modelUsed >= modelLimit;
  const scrollRef = useRef<HTMLDivElement>(null), fileRef = useRef<HTMLInputElement>(null), follow = useRef(true), readingTop = useRef(0);
  const [dismissed, setDismissed] = useState<string>(), [answer, setAnswer] = useState("");
  const questionMessage = pendingQuestion(project), question = questionMessage?.at !== dismissed ? questionMessage?.question : undefined;
  useLayoutEffect(() => { follow.current = true; readingTop.current = 0; setDismissed(undefined); setAnswer(""); }, [project?.id]);
  useEffect(() => { setAnswer(""); }, [questionMessage?.at]);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = follow.current ? el.scrollHeight : readingTop.current;
  }, [project, events, pending]);
  const entries = project ? conversationEntries(project) : [];
  const stopButton = <button type="button" className={`send${running ? " is-stop" : ""}`} aria-label={running ? "暂停任务" : "发送需求"} title={running ? "暂停当前任务" : "发送需求"} disabled={running ? pending : disabled || (!text.trim() && !files.length)} onClick={() => running ? onPause() : void onSend()}>{pending ? <Loader2 size={17} className="spin" /> : running ? <Square size={12} fill="currentColor" /> : <ArrowUp size={17} />}</button>;
  return <aside className="agent-panel conversation-panel" aria-label="与智能体对话">
    <header className="agent-header"><div><span className="agent-sigil"><Sparkles size={16} /></span><span><strong>与你的信息设计团队对话</strong><small>{running ? "正在协作处理任务" : project ? "从一个问题，到一份作品。" : "创建项目，开始对话"}</small></span></div><span className="agent-mode">自动工作流</span></header>
    <div className="agent-scroll" ref={scrollRef} onScroll={event => { const el = event.currentTarget; readingTop.current = el.scrollTop; follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 72; }}>
      {!entries.length ? <section className="agent-intro"><p className="eyebrow">LET’S MAKE SENSE OF DATA</p><h2>你想讲述什么？</h2><p>告诉我你的主题与目标受众，上传已有资料。没有数据，也可以从一个问题开始。</p><div className="suggestions">{["分析这份数据，发现值得讲述的趋势", "为公众设计一张清晰的研究信息图"].map(s => <button disabled={disabled} key={s} onClick={() => setText(s)}>{s}</button>)}</div></section> : <div className="workflow-stream">
        {entries.map(entry => entry.kind === "stage" && project ? <StageCard key={`${project.id}-${entry.key}`} project={project} role={entry.role} events={events} pending={pending} onRerun={() => onRerun(entry.role)} /> : entry.kind === "message" ? <div className={`workflow-message-row ${entry.message.role}`} key={entry.key}><div className="workflow-message-bubble"><small>{entry.message.role === "user" ? "你" : "信息设计团队"} · {time(entry.at)}</small><p>{entry.message.text}</p></div></div> : null)}
        {project?.state.status === "completed" && project.has_html && <section className={`completion-summary${project.state.visual_review?.status === "needs_revision" ? " needs-revision" : ""}`} aria-label="项目完成摘要"><strong><Check size={14} /> {project.state.visual_review?.status === "needs_revision" ? "作品已生成 · 视觉验收未通过" : "信息图已完成"}</strong><p>{project.research?.sources.length ?? 0} 个来源 · {project.datafacts?.facts.length ?? 0} 条数据事实 · {project.design?.components.length ?? 0} 个设计组件</p><div><button onClick={onPreview}>查看作品<ArrowUpRight size={12} /></button><a href={`/api/projects/${project.id}/html`} download>下载 HTML</a></div></section>}
      </div>}
      {project && entries.length > 0 && !running && !question && ["failed", "interrupted"].includes(project.state.status) && <button className="clarification-submit" disabled={pending || modelExhausted} onClick={onContinue}><Play size={12} />继续执行</button>}
      {budget && <section className="model-budget-summary" aria-label="模型调用额度"><p>模型调用：任务累计 {modelUsed} / {modelLimit} 次 · 本次运行 {budget.run_model ?? "—"} / {budget.model_run_limit ?? 120} 次</p>
        {modelExhausted && !running && props.onAddModelBudget && <><p>任务累计额度已用完。追加只增加调用额度，可能产生模型费用；保留历史用量、费用与返修限制。</p><button type="button" className="clarification-submit" disabled={pending} onClick={() => props.onAddModelBudget?.(40)}>追加 40 次模型额度</button><small>追加后点击“继续执行”启动任务。</small></>}
      </section>}
      {project?.state.error && !project.state.current_stage && !question && <p className="workflow-error" role="alert">{project.state.error}</p>}
    </div>
    <div className="composer-wrap">
      {!project && <p className="composer-project-hint" id="conversation-project-hint" role="status">请先新建项目，或从左侧列表选择已有项目，再开始对话。</p>}
      {error && <div className="error-banner" role="alert">{error}<button aria-label="关闭错误" onClick={clearError}><X size={12} /></button></div>}
      {question ? <section className="clarification-card" aria-label="需求确认"><div className="clarification-heading"><span><Bot size={14} /></span><div><strong>需求确认</strong><p>{question.title}</p></div><button aria-label="关闭需求确认，返回对话" onClick={() => setDismissed(questionMessage?.at)}><X size={14} /></button></div><div className="clarification-options">{question.options.map(option => <button type="button" disabled={disabled} className={answer === option ? "selected" : ""} aria-pressed={answer === option} key={option} onClick={() => setAnswer(option)}>{option}</button>)}</div><input aria-label="自定义回答" disabled={disabled} value={answer} onChange={e => setAnswer(e.target.value)} placeholder="选择一个选项，或输入你的回答…" /><button className="clarification-submit" disabled={disabled || !answer.trim()} onClick={() => void onSend(answer)}>{pending ? "正在提交…" : "提交回答"}<ArrowUp size={13} /></button></section> : <>
        {files.length > 0 && <div className="attachment-row">{files.map((file, i) => <span key={`${file.name}-${i}`} title={file.name}><FileText size={13} /><span>{file.name}</span><button aria-label={`移除 ${file.name}`} disabled={disabled} onClick={() => setFiles(items => items.filter((_, j) => i !== j))}><X size={11} /></button></span>)}</div>}
        <form className={`composer ${!project ? "requires-project" : ""}`} onSubmit={e => { e.preventDefault(); void onSend(); }}><textarea aria-label="描述信息图需求" aria-describedby={!project ? "conversation-project-hint" : undefined} disabled={disabled} rows={3} value={text} onChange={e => setText(e.target.value)} placeholder={!project ? "请先新建或选择项目" : running ? "团队正在工作，可点击右下角暂停" : "描述你想完成的信息设计…"} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void onSend(); } }} /><div><button type="button" className="attach" aria-label="上传数据文件" title="CSV · Excel · PDF · Word" disabled={disabled} onClick={() => fileRef.current?.click()}><Paperclip size={17} /></button><span>{!running && "Enter 发送 · Shift + Enter 换行"}</span>{stopButton}</div></form>
      </>}
      <input hidden ref={fileRef} type="file" disabled={disabled} multiple accept=".csv,.tsv,.xlsx,.pdf,.docx,.txt,.md,.json" onChange={e => { if (!disabled) setFiles(items => [...items, ...Array.from(e.target.files || [])]); e.target.value = ""; }} />
    </div>
  </aside>;
}
