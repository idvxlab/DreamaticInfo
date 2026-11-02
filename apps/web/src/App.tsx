import PerformancePanel from "./PerformancePanel";
import DesignWorkbench from "./DesignWorkbench";
import AnalysisProgress from "./AnalysisProgress";
import FactCard from "./FactCard";
import ResearchProgress from "./ResearchProgress";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  Search,
  PanelLeft,
  MessageSquare,
  ChartNoAxesCombined,
  Workflow,
  LayoutTemplate,
  FileText,
  X,
  Download,
  Loader2,
  Globe,
  ChevronRight,
  Layers,
  BookOpen,
  Link2,
  ExternalLink,
  FolderOpen,
  Command,
} from "lucide-react";
import {
  type Project,
  type ProjectDetail,
} from "../../../packages/shared/types";
import { api } from "./api";
import Settings from "./Settings";
import BrandMenu from "./BrandMenu";
import ProjectList from "./ProjectList";
import Conversation from "./Conversation";
import type { ConversationEvent } from "./conversation-model";
const statusLabel: Record<string, string> = {
  pending: "等待执行",
  running: "正在执行",
  completed: "已完成",
  failed: "执行失败",
  interrupted: "已中断",
};
const tabs = [
  ["sources", "数据来源"],
  ["facts", "数据事实"],
  ["design", "逻辑与叙事"],
  ["preview", "信息图作品"],
] as const;
type Tab = (typeof tabs)[number][0];
export default function App() {
  const [projects, setProjects] = useState<Project[]>([]),
    [id, setId] = useState<string | null>(null),
    [project, setProject] = useState<ProjectDetail | null>(null),
    [tab, setTab] = useState<Tab>("sources"),
    [text, setText] = useState(""),
    [files, setFiles] = useState<File[]>([]),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [creating, setCreating] = useState(false),
    [notice, setNotice] = useState(""),
    [settings, setSettings] = useState(false),
    [filter, setFilter] = useState(""),
    [events, setEvents] = useState<ConversationEvent[]>([]),
    [showNav, setShowNav] = useState(false),
    [linked, setLinked] = useState<string | null>(null);
  const selected = useRef(id);
  selected.current = id;
  const listRequest = useRef(0),
    creatingRef = useRef(false);
  const refreshList = async () => {
    const request = ++listRequest.current;
    const items = await api<Project[]>("/projects");
    if (request === listRequest.current) setProjects(items);
    return items;
  };
  const refresh = async (target: string) => {
    const p = await api<ProjectDetail>(`/projects/${target}`);
    if (selected.current === target) setProject(p);
    await refreshList();
  };
  useEffect(() => {
    refreshList().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    setEvents([]);
    setLinked(null);
    if (!id) {
      setProject(null);
      return;
    }
    let disposed = false;
    const update = () => {
      if (!disposed)
        refresh(id).catch((e) => {
          if (!disposed) setError(e.message);
        });
    };
    update();
    const timer = setInterval(update, 1800);
    const source = new EventSource(`/api/projects/${id}/events`);
    source.onmessage = (e) => {
      if (disposed) return;
      const event = JSON.parse(e.data);
      setEvents((es) => [...es.slice(-199), event]);
      update();
    };
    return () => {
      disposed = true;
      clearInterval(timer);
      source.close();
    };
  }, [id]);
  const busy = project?.state.status === "running";
  const hasSelectedProject = !!id && project?.id === id;
  const conversationDisabled =
    !hasSelectedProject || busy || pending || creating;
  async function act(fn: () => Promise<unknown>) {
    setPending(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  function choose(p: Project) {
    selected.current = p.id;
    setProject({
      ...p,
      has_html: !!p.state.stages.builder.version,
      has_pdf: false,
      files: [],
    });
    setId(p.id);
    setText("");
    setFiles([]);
    setError("");
    setShowNav(false);
    setNotice("");
  }
  async function newProject() {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    setError("");
    const previous = selected.current;
    try {
      const p = await api<ProjectDetail>("/projects", {
        method: "POST",
        body: JSON.stringify({ brief: "", mode: "live" }),
      });
      // Persisted draft appears before any model execution or file upload.
      ++listRequest.current;
      setProjects((items) => [p, ...items.filter((x) => x.id !== p.id)]);
      setFilter("");
      if (selected.current === previous) {
        choose(p);
        setTab("sources");
      }
      await refreshList();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }
  async function renameProject(target: string, title: string) {
    await api(`/projects/${target}/title`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    });
    ++listRequest.current;
    setProjects((items) =>
      items.map((p) => (p.id === target ? { ...p, title } : p)),
    );
    setProject((p) => (p?.id === target ? { ...p, title } : p));
    setNotice("项目已改名");
    await refreshList();
  }
  async function deleteProject(target: string) {
    await api(`/projects/${target}`, { method: "DELETE" });
    ++listRequest.current;
    setProjects((items) => items.filter((p) => p.id !== target));
    if (selected.current === target) {
      selected.current = null;
      setId(null);
      setProject(null);
      setText("");
      setFiles([]);
      setError("");
    }
    const items = await refreshList();
    if (selected.current === null && items[0]) choose(items[0]);
    setNotice("项目已移至工作目录的 .trash，可从磁盘恢复。");
  }
  async function send(message = text) {
    if (
      conversationDisabled ||
      creatingRef.current ||
      !id ||
      selected.current !== id
    )
      return;
    if (!message.trim() && !files.length) return;
    const target = id;
    await act(async () => {
      if (files.length) {
        const form = new FormData();
        files.forEach((f) => form.append("files", f));
        await api(`/projects/${target}/uploads`, {
          method: "POST",
          body: form,
        });
      }
      if (message.trim())
        await api(`/projects/${target}/messages`, {
          method: "POST",
          body: JSON.stringify({ text: message }),
        });
      else await api(`/projects/${target}/run`, { method: "POST" });
      setText("");
      setFiles([]);
      await refresh(target);
    });
  }
  async function pdf() {
    await act(async () => {
      const r = await fetch(`/api/projects/${id}/pdf`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json()).error);
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "dreamatic-info.pdf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      if (id) await refresh(id);
    });
  }
  return (
    <div className={`app ${showNav ? "nav-open" : ""}`}>
      <aside className="sidebar">
        <BrandMenu onSettings={() => setSettings(true)} />
        <button
          className="new-project"
          onClick={() => void newProject()}
          disabled={creating || pending}
        >
          {creating ? (
            <Loader2 size={15} className="spin" />
          ) : (
            <Plus size={15} />
          )}{" "}
          {creating ? "正在创建…" : "新建项目"} <kbd>＋</kbd>
        </button>
        <label className="sidebar-search">
          <Search size={14} />
          <input
            aria-label="搜索项目"
            placeholder="搜索项目…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </label>
        <p className="nav-label">WORKSPACE</p>
        <button
          className="nav-button active"
          onClick={() => {
            setTab("facts");
            setShowNav(false);
          }}
        >
          <Layers size={15} /> 信息设计工作台 <span>↗</span>
        </button>
        <div className="project-label">
          <p className="nav-label">最近项目</p>
          <small>{projects.length}</small>
        </div>
        <ProjectList
          projects={projects.filter((p) =>
            p.title.toLowerCase().includes(filter.toLowerCase()),
          )}
          selected={id}
          onSelect={choose}
          onRename={renameProject}
          onDelete={deleteProject}
        />
        <div className="sidebar-note">
          <span className="tiny-dot" /> Pi Harness 1.4.0 <span>LOCAL</span>
        </div>
        <div className="profile">
          <span>DI</span>
          <div>
            <strong>Dreamatic Studio</strong>
            <small>让数据，成为故事。</small>
          </div>
        </div>
      </aside>
      <main className="workspace">
        <header className="workspace-header">
          <div>
            <button
              className="mobile-toggle icon-button"
              aria-label="切换侧栏"
              onClick={() => setShowNav(!showNav)}
            >
              <PanelLeft size={17} />
            </button>
            <span className="project-kicker">WORKSPACE</span>
            <ChevronRight size={13} />
            <strong>{project?.title || "新的信息设计"}</strong>
          </div>
        </header>
        <div className="work-body">
          <div className="canvas-column">
            <div className="canvas-heading">
              <div>
                <p className="eyebrow">INFORMATION DESIGN STUDIO</p>
                <h1>
                  {project
                    ? "把洞察，连接成故事。"
                    : "从数据出发，让洞察发生。"}
                </h1>
              </div>
              <span className="outline-badge">
                <Workflow size={12} /> 5 个专业智能体
              </span>
            </div>
            <div className="tabs" role="tablist" aria-label="项目内容">
              {tabs.map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={tab === key}
                  className={tab === key ? "active" : ""}
                  onClick={() => {
                    setTab(key);
                    setLinked(null);
                  }}
                >
                  {key === "facts" ? (
                    <Layers size={14} />
                  ) : key === "preview" ? (
                    <LayoutTemplate size={14} />
                  ) : key === "design" ? (
                    <Workflow size={14} />
                  ) : (
                    <Globe size={14} />
                  )}{" "}
                  {label}
                  {key === "design" && (project?.state.stages.designer.status === "running" ? <small>设计中</small> : project?.design_progress?.status === "draft" ? <small>{project.design_progress.counts.stories} 草稿</small> : null)}
                  {key === "facts" && (
                    <small>{project?.datafacts?.facts.length ?? project?.analysis_progress?.counts.saved ?? 0}{!project?.datafacts && (project?.analysis_progress?.counts.saved ?? 0) > 0 && " 草稿"}</small>
                  )}
                </button>
              ))}
            </div>
            <div className="canvas-content">
              {project && !!project.retained_documents?.length && <aside className="retained-results-notice" role="status"><strong>已保存的报告仍然保留</strong><p>当前流程正在重新生成或等待执行，旧报告暂不作为有效成果展示。可只读查看已保存内容。</p><div>{project.retained_documents.map(name => <a key={name} href={`/api/projects/${project.id}/retained-document/${name}`} target="_blank" rel="noreferrer">{({ 'intent.md': '需求报告', 'research.md': '调研报告', 'datafacts.md': '事实报告', 'design.md': '设计报告', 'delivery.md': '交付报告' } as Record<string,string>)[name]}<ArrowUpRight size={12}/></a>)}</div></aside>}

              {!project && (
                <div className="welcome">
                  <div className="welcome-art" aria-hidden="true">
                    <div className="orbit orbit-one" />
                    <div className="orbit orbit-two" />
                    <div className="mini-chart">
                      <span />
                      <span />
                      <span />
                      <span />
                      <i />
                    </div>
                    <span className="art-label">FACT → STORY</span>
                    <div className="floating-dot" />
                  </div>
                  <p className="eyebrow">EVERY DATASET HAS A STORY</p>
                  <h2>
                    好故事，
                    <br />
                    藏在数据的细节里。
                  </h2>
                  <p className="welcome-copy">
                    上传一份数据，或描述一个值得探索的问题。
                    <br />
                    从发现事实到视觉叙事，让五位专业智能体协同完成。
                  </p>
                  <button
                    className="primary"
                    onClick={() => void newProject()}
                    disabled={pending || creating}
                  >
                    {creating ? (
                      <Loader2 size={14} className="spin" />
                    ) : (
                      <Plus size={14} />
                    )}{" "}
                    {creating ? "正在创建…" : "新建项目"}{" "}
                    <ArrowUpRight size={14} />
                  </button>
                  <small className="welcome-caption">
                    创建空白项目，上传资料或描述你的需求
                  </small>
                  <div className="welcome-features">
                    <span>
                      <FileText size={15} /> 多格式数据
                    </span>
                    <span>
                      <Link2 size={15} /> 事实关联
                    </span>
                    <span>
                      <LayoutTemplate size={15} /> HTML 与 PDF
                    </span>
                  </div>
                </div>
              )}
              {project && tab === "facts" && (
                <>
                  <div className="section-heading">
                    <div>
                      <h2>
                        Data Facts <span>数据事实</span>
                      </h2>
                      <p>
                        {project.datafacts?.summary ||
                          "从原始资料中，提取每一条有据可依的发现。"}
                      </p>
                    </div>
                    {linked && (
                      <button
                        className="subtle"
                        onClick={() => setLinked(null)}
                      >
                        显示全部 <X size={12} />
                      </button>
                    )}
                  </div>
                  {project.datafacts ? (
                    <div className="facts-grid">
                      {project.datafacts.facts
                        .filter(
                          (f) =>
                            !linked ||
                            f.id === linked ||
                            project
                              .datafacts!.facts.find((x) => x.id === linked)
                              ?.relations.some((r) => r.target_id === f.id),
                        )
                        .map((f, i) => (
                          <FactCard
                            key={f.id}
                            fact={f}
                            index={i}
                            project={project}
                            linked={linked === f.id}
                            onLink={() =>
                              setLinked(linked === f.id ? null : f.id)
                            }
                          />
                        ))}
                    </div>
                  ) : (
                    <AnalysisProgress key={project.id} project={project} progress={project.analysis_progress} />
                  )}
                </>
              )}
              {project && tab === "preview" && (
                <>
                  <div className="section-heading">
                    <div>
                      <h2>作品预览</h2>
                      <p>
                        {project.design?.title ||
                          "设计与实现完成后，在这里查看最终信息图。"}
                      </p>
                    </div>
                    {project.has_html && (
                      <div className="export-actions">
                        <a
                          className="subtle button"
                          href={`/api/projects/${id}/html`}
                          download
                        >
                          <Download size={13} /> HTML
                        </a>
                        <button
                          className="primary small"
                          onClick={pdf}
                          disabled={pending || busy}
                        >
                          <Download size={13} />{" "}
                          {pending ? "导出中…" : "PDF 海报"}
                        </button>
                      </div>
                    )}
                  </div>
                  {project.state.visual_review?.status === "needs_revision" && <div className="visual-review-notice" role="status">
                    <strong>作品已生成，视觉验收未通过</strong>
                    <p>自动返修额度已用完。作品仍可预览和导出，以下问题尚待处理：</p>
                    <ul>{project.state.visual_review.issues.map(issue => <li key={issue.id}>{issue.component} · {issue.owner}：{issue.message}</li>)}</ul>
                  </div>}
                  {project.performance && <PerformancePanel performance={project.performance} />}
                  {project.has_html ? (
                    <div className="preview-frame">
                      <iframe
                        key={project.state.stages.builder.version}
                        src={`/api/projects/${id}/preview`}
                        title="信息图作品"
                        sandbox="allow-scripts"
                      />
                    </div>
                  ) : (
                    <EmptyState
                      icon={<LayoutTemplate size={26} />}
                      title="给洞察，一个看得见的形状。"
                      text="Builder 会将设计方案实现为可交互、可打印的信息图。"
                    />
                  )}
                </>
              )}
              {project && tab === "design" && <DesignWorkbench key={project.id} project={project} onLocateFact={(factId) => { setTab("facts"); setLinked(factId); }} />}
              {project && tab === "sources" && (
                <>
                  <div className="section-heading">
                    <div>
                      <h2>数据来源</h2>
                      <p>保留原始资料、采集链接与来源限制，让洞察有据可依。</p>
                    </div>
                    <span className="count-label">
                      {project.research ? project.research.sources.length : project.uploads.length + (project.research_progress?.sources.filter(s => s.status === "accepted").length || 0)}{" "}
                      个来源
                    </span>
                  </div>
                  {project.research_progress && <ResearchProgress projectId={project.id} progress={project.research_progress} />}
                  {project.research && <h3 className="research-final-heading">正式调研来源</h3>}
                  {project.research?.sources.map((s) => (
                    <article className="source-card" key={s.id}>
                      <span className="source-symbol">
                        {s.kind === "web" ? (
                          <Globe size={20} />
                        ) : (
                          <FileText size={20} />
                        )}
                      </span>
                      <div>
                        <h3>{s.title}</h3>
                        <p>{s.fields.join(" · ") || "文档资料"}</p>
                        <small>
                          采集于{" "}
                          {new Date(s.accessed_at).toLocaleDateString("zh-CN")}
                          {s.published_at
                            ? ` · 发布于 ${s.published_at}`
                            : " · 发布日期未知"}
                        </small>
                        {s.limitations.map((l, i) => (
                          <p className="source-limit" key={i}>
                            {l}
                          </p>
                        ))}
                        <div className="source-links">
                          <a
                            href={`/api/projects/${id}/source/${s.id}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            原始依据 <ArrowUpRight size={12} />
                          </a>
                          {s.url && (
                            <a href={s.url} target="_blank" rel="noreferrer">
                              访问来源 <ExternalLink size={12} />
                            </a>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                  {!project.research &&
                    project.uploads.map((f) => (
                      <article className="source-card" key={f.id}>
                        <FileText size={20} />
                        <div>
                          <h3>{f.name}</h3>
                          <p>{(f.size / 1024).toFixed(1)} KB · 已导入</p>
                        </div>
                      </article>
                    ))}
                  {!project.research && !project.uploads.length && !project.research_progress && (
                    <EmptyState
                      icon={<Globe size={26} />}
                      title="每一个发现，都有来处。"
                      text="上传数据，或由 Researcher 搜索公开资料。"
                    />
                  )}
                </>
              )}
            </div>
            <footer className="canvas-footer">
              <span>
                <span className="tiny-dot" />{" "}
                {project ? project.state.status === "completed" && project.state.visual_review?.status === "needs_revision" ? "视觉验收未通过" : project.state.status === "interrupted" && project.state.error === "用户暂停任务" ? "已暂停" : statusLabel[project.state.status] : "准备就绪"}
              </span>
              <span>DATA FACTS → DATA STORYTELLING → INFORMATION DESIGN</span>
              <span>Dreamatic · Info</span>
            </footer>
          </div>
          <Conversation
            project={hasSelectedProject ? project : null}
            events={events}
            text={text}
            setText={setText}
            files={files}
            setFiles={setFiles}
            disabled={conversationDisabled}
            pending={pending}
            error={error}
            clearError={() => setError("")}
            onSend={send}
            onPause={() => void act(async () => {
              await api(`/projects/${id}/pause`, { method: "POST" });
              await refresh(id!);
            })}
            onContinue={() => void act(async () => {
              await api(`/projects/${id}/run`, { method: "POST" });
              await refresh(id!);
            })}
            onAddModelBudget={amount => void act(async () => {
              await api(`/projects/${id}/model-budget`, { method: "POST", body: JSON.stringify({ amount }) });
              await refresh(id!);
              setNotice(`已追加 ${amount} 次模型调用额度；点击继续执行以恢复任务`);
            })}
            onRerun={role => void act(async () => {
              await api(`/projects/${id}/rerun`, { method: "POST", body: JSON.stringify({ role }) });
              await refresh(id!);
            })}
            onPreview={() => setTab("preview")}
          />
        </div>
      </main>
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button aria-label="关闭提示" onClick={() => setNotice("")}>
            <X size={12} />
          </button>
        </div>
      )}
      {settings && (
        <Settings
          onClose={() => {
            setSettings(false);
            requestAnimationFrame(() =>
              document
                .querySelector<HTMLButtonElement>(
                  '[aria-label="Dreamatic · Info 菜单"]',
                )
                ?.focus(),
            );
          }}
        />
      )}
    </div>
  );
}
function EmptyState({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="empty-state">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
