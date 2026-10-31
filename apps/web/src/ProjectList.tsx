import { placeMenu } from "./menu-position";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChartNoAxesCombined,
  Check,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import type { Project } from "../../../packages/shared/types";
const statuses: Record<string, string> = {
  pending: "等待执行",
  running: "正在执行",
  completed: "已完成",
  failed: "执行失败",
  interrupted: "已暂停",
};
export default function ProjectList({
  projects,
  selected,
  onSelect,
  onRename,
  onDelete,
}: {
  projects: Project[];
  selected: string | null;
  onSelect: (project: Project) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [menu, setMenu] = useState<string | null>(null),
    [editing, setEditing] = useState<string | null>(null),
    [title, setTitle] = useState(""),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const popup = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!menu) {
      setPosition(null);
      return;
    }
    const trigger = area.current?.querySelector<HTMLElement>(
      `[data-project-row="${menu}"] .project-menu-trigger`,
    );
    if (!trigger || !popup.current) return;
    setPosition(
      placeMenu(
        trigger.getBoundingClientRect(),
        popup.current.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [menu]);
  useEffect(() => {
    if (menu && position)
      popup.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [menu, position]);
  const area = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    }
  }, [editing]);
  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => {
      if (
        !area.current
          ?.querySelector(`[data-project-row="${menu}"]`)
          ?.contains(event.target as Node) &&
        !popup.current?.contains(event.target as Node)
      )
        setMenu(null);
    };
    const dismiss = () => setMenu(null);
    document.addEventListener("pointerdown", close);
    window.addEventListener("resize", dismiss);
    document.addEventListener("scroll", dismiss, true);
    area.current?.addEventListener("scroll", dismiss);
    const list = area.current;
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", dismiss);
      document.removeEventListener("scroll", dismiss, true);
      list?.removeEventListener("scroll", dismiss);
    };
  }, [menu]);
  async function rename() {
    if (!editing || saving || !title.trim()) return;
    setSaving(true);
    setError("");
    try {
      await onRename(editing, title.trim());
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function remove(p: Project) {
    setMenu(null);
    setError("");
    if (
      !window.confirm(
        `删除项目“${p.title}”？\n\n项目及全部资料将移入工作目录的 .trash，可从磁盘恢复。`,
      )
    )
      return;
    setSaving(true);
    try {
      await onDelete(p.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="project-list" ref={area}>
      {projects.map((p) => (
        <div
          className={`project-row ${selected === p.id ? "selected" : ""}`}
          data-project-row={p.id}
          key={p.id}
        >
          {editing === p.id ? (
            <form
              className="project-rename"
              onSubmit={(e) => {
                e.preventDefault();
                void rename();
              }}
            >
              <input
                ref={input}
                aria-label="项目名称"
                value={title}
                maxLength={120}
                disabled={saving}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && !saving) {
                    setEditing(null);
                    setError("");
                  }
                }}
              />
              <button
                type="submit"
                aria-label="保存项目名称"
                disabled={saving || !title.trim()}
              >
                {saving ? (
                  <Loader2 size={13} className="spin" />
                ) : (
                  <Check size={13} />
                )}
              </button>
              <button
                type="button"
                aria-label="取消改名"
                disabled={saving}
                onClick={() => {
                  setEditing(null);
                  setError("");
                }}
              >
                <X size={13} />
              </button>
            </form>
          ) : (
            <>
              <button
                className="project-select"
                aria-current={selected === p.id ? "true" : undefined}
                onClick={() => {
                  setMenu(null);
                  onSelect(p);
                }}
              >
                <span className="project-icon">
                  <ChartNoAxesCombined size={15} />
                </span>
                <span>
                  <strong>{p.title}</strong>
                  <small>
                    {!p.brief.trim() && p.state.status === "pending"
                      ? "草稿"
                      : statuses[p.state.status]}
                  </small>
                </span>
                {p.state.status === "running" && (
                  <Loader2 size={12} className="spin" />
                )}
              </button>
              <button
                className="project-menu-trigger"
                aria-label={`项目操作：${p.title}`}
                aria-haspopup="menu"
                aria-expanded={menu === p.id}
                disabled={saving}
                onClick={() => {
                  setError("");
                  setMenu(menu === p.id ? null : p.id);
                }}
              >
                <MoreHorizontal size={15} />
              </button>
              {menu === p.id &&
                createPortal(
                  <div
                    ref={popup}
                    className="project-menu project-menu-floating"
                    style={{
                      top: position?.top ?? 0,
                      left: position?.left ?? 0,
                      visibility: position ? "visible" : "hidden",
                    }}
                    role="menu"
                    aria-label={`${p.title} 的项目操作`}
                    onKeyDown={(e) => {
                      if (
                        ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)
                      ) {
                        e.preventDefault();
                        const items = [
                          ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
                            '[role="menuitem"]:not(:disabled)',
                          ),
                        ];
                        const index = items.indexOf(
                          document.activeElement as HTMLButtonElement,
                        );
                        const next =
                          e.key === "Home"
                            ? 0
                            : e.key === "End"
                              ? items.length - 1
                              : (index +
                                  (e.key === "ArrowDown" ? 1 : -1) +
                                  items.length) %
                                items.length;
                        items[next]?.focus();
                      }
                      if (e.key === "Tab") setMenu(null);
                      if (e.key === "Escape") {
                        setMenu(null);
                        area.current
                          ?.querySelector<HTMLButtonElement>(
                            `[data-project-row="${p.id}"] .project-menu-trigger`,
                          )
                          ?.focus();
                      }
                    }}
                  >
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMenu(null);
                        setEditing(p.id);
                        setTitle(p.title);
                        setError("");
                      }}
                    >
                      <Pencil size={13} /> 改名
                    </button>
                    <button
                      role="menuitem"
                      className="danger"
                      disabled={p.state.status === "running"}
                      title={
                        p.state.status === "running"
                          ? "请先暂停任务，再删除项目"
                          : undefined
                      }
                      onClick={() => void remove(p)}
                    >
                      <Trash2 size={13} /> 删除
                    </button>
                  </div>,
                  document.body,
                )}
            </>
          )}
        </div>
      ))}
      {!projects.length && <p className="empty-projects">暂无匹配项目。</p>}
      {error && (
        <p className="project-action-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
