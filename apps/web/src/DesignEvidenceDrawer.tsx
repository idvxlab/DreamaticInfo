import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, X } from "lucide-react";
import type { ProjectDetail } from "../../../packages/shared/types";
import FactCard from "./FactCard";

export interface EvidenceSelection { ids: string[]; library?: boolean; title: string }
export default function DesignEvidenceDrawer({ project, selection, selectedIds, anchor, onClose, onLocateFact }: {
  project: ProjectDetail; selection: EvidenceSelection; selectedIds: Set<string>; anchor: HTMLElement | null;
  onClose: () => void; onLocateFact: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), close = useRef<HTMLButtonElement>(null), titleId = useId();
  const [ids, setIds] = useState(selection.ids), [filter, setFilter] = useState("all");
  const facts = project.datafacts?.facts ?? [], shown = [...new Set(ids)].flatMap(id => { const fact = facts.find(item => item.id === id); return fact ? [fact] : []; });
  useEffect(() => {
    const element = dialog.current!, previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const position = () => {
      const rect = anchor?.getBoundingClientRect();
      if (!rect) return;
      const right = Math.min(window.innerWidth, rect.right), left = Math.max(0, rect.left);
      const width = Math.min(480, right - left);
      let top = Math.max(0, rect.top), height = Math.min(window.innerHeight, rect.bottom) - top;
      if (height < 320) { top = 0; height = window.innerHeight; }
      Object.assign(element.style, { left: `${right - width}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
    };
    position(); element.showModal(); close.current?.focus({ preventScroll: true });
    const observer = new ResizeObserver(position); if (anchor) observer.observe(anchor);
    window.addEventListener("resize", position);
    return () => { observer.disconnect(); window.removeEventListener("resize", position); element.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return createPortal(<dialog ref={dialog} className="dw-evidence-drawer" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => {
    const rect = dialog.current!.getBoundingClientRect();
    if (event.target === dialog.current && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) onClose();
  }}>
    <header><div><h3 id={titleId}>{selection.title}</h3><p>查看原文、统计口径与来源，关闭后返回当前段落。</p></div><button ref={close} type="button" className="dw-icon-button" aria-label="关闭事实与证据" onClick={onClose}><X size={18} /></button></header>
    <div className="dw-drawer-body">
      {selection.library && <section className="dw-fact-library"><label>事实范围<select aria-label="筛选事实范围" value={filter} onChange={event => { setFilter(event.target.value); setIds([]); }}><option value="all">全部事实（{facts.length}）</option><option value="selected">已选用（{facts.filter(fact => selectedIds.has(fact.id)).length}）</option><option value="unused">未选用（{facts.filter(fact => !selectedIds.has(fact.id)).length}）</option></select></label><div className="dw-library-list">{facts.filter(fact => filter === "all" || (filter === "selected" ? selectedIds.has(fact.id) : !selectedIds.has(fact.id))).map(fact => <button type="button" key={fact.id} aria-pressed={ids.includes(fact.id)} onClick={() => setIds([fact.id])}><span>{fact.title}</span><small>{fact.id} · {selectedIds.has(fact.id) ? "已选用" : "未选用"}</small></button>)}{!facts.some(fact => filter === "all" || (filter === "selected" ? selectedIds.has(fact.id) : !selectedIds.has(fact.id))) && <p className="dw-muted">当前范围没有事实。</p>}</div></section>}
      {shown.map((fact, index) => <section className="dw-drawer-fact" key={fact.id}><div className="dw-drawer-fact-heading"><small>{fact.id}</small><button type="button" className="dw-text-button" onClick={() => onLocateFact(fact.id)}>在数据事实中定位<ArrowUpRight size={12} /></button></div><FactCard fact={fact} index={index} project={project} linked={false} onLink={() => setIds([fact.id, ...fact.relations.map(relation => relation.target_id)])} /><div className="dw-source-links">{fact.source_ids.map(id => <a key={id} href={`/api/projects/${project.id}/source/${encodeURIComponent(id)}`} target="_blank" rel="noreferrer">{project.research?.sources.find(source => source.id === id)?.title ?? id}<ArrowUpRight size={11} /></a>)}</div></section>)}
      {!shown.length && <p className="dw-muted">{selection.library ? "选择一条事实查看证据。未选用不代表该事实没有价值。" : "引用的事实当前不可用，请在检查视图核对事实编号。"}</p>}
    </div>
  </dialog>, document.body);
}
