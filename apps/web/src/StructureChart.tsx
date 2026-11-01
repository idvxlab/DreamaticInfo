import { useId } from "react";
import { scaleLinear } from 'd3';
import type { Fact } from '../../../packages/shared/types';
import { eventTime, structureIssues } from '../../../packages/shared/structure';
export default function StructureChart({ fact }: { fact: Fact }) {
  const arrowId = useId();
  const issues = structureIssues(fact), s = fact.structure;
  if (!s || issues.length) return <p role="status">{issues.join('；')}</p>;
  const width = 600, height = 320;
  const range = (values: number[], start: number, end: number) => { const lo = Math.min(...values), hi = Math.max(...values); return scaleLinear().domain(lo === hi ? [lo - 1, hi + 1] : [lo, hi]).range([start, end]); };
  const title = <title>{fact.title}</title>;
  let visual;
  if (fact.type === 'scatter') {
    const x = range(s.observations.map(p => p.x), 70, 550), y = range(s.observations.map(p => p.y), 260, 25);
    visual = <svg viewBox={`0 0 ${width} ${height}`} role="img">{title}<path d="M70 25V260H550" fill="none" stroke="currentColor"/>{x.ticks(5).map(v => <text key={v} x={x(v)} y={280} textAnchor="middle" fontSize="12">{v}</text>)}{y.ticks(5).map(v => <text key={v} x={60} y={y(v)} textAnchor="end" fontSize="12">{v}</text>)}{s.observations.map(p => <circle key={p.id} cx={x(p.x)} cy={y(p.y)} r={5} fill="var(--accent,#d76942)" tabIndex={0}><title>{`${p.id}: ${p.x} ${s.x_unit}, ${p.y} ${s.y_unit}`}</title></circle>)}<text x={310} y={310} textAnchor="middle">{s.x_variable} ({s.x_unit})</text><text x={70} y={17}>{s.y_variable} ({s.y_unit})</text></svg>;
  } else if (fact.type === 'timeline') {
    const x = range(s.events.map(p => eventTime(p.date)), 45, 555);
    visual = <svg viewBox={`0 0 ${width} ${height}`} role="img">{title}<path d="M45 150H555" stroke="currentColor"/>{s.events.map((p, i) => <g key={p.id} tabIndex={0}><circle cx={x(eventTime(p.date))} cy={150} r={5} fill="var(--accent,#d76942)"/><text x={x(eventTime(p.date))} y={i % 2 ? 195 : 105} textAnchor="middle" fontSize="12">{p.date}</text><title>{`${p.date}: ${p.label}`}</title></g>)}</svg>;
  } else {
    const depth = (id: string): number => { const parent = s.edges.find(e => e.to === id); return parent ? 1 + depth(parent.from) : 0; };
    const levels = new Map<number, string[]>();
    for (const n of s.nodes) { const level = fact.type === 'hierarchy' ? depth(n.id) : Math.floor(s.nodes.indexOf(n) / 3); levels.set(level, [...levels.get(level) ?? [], n.id]); }
    const positions = new Map(s.nodes.map(n => { const level = fact.type === 'hierarchy' ? depth(n.id) : Math.floor(s.nodes.indexOf(n) / 3), group = levels.get(level)!; return [n.id, { x: (group.indexOf(n.id) + .5) * 600 / group.length - 65, y: 25 + level * 105 }]; }));
    visual = <svg viewBox={`0 0 600 ${Math.max(180, levels.size * 105 + 20)}`} role="img">{title}<defs><marker id={arrowId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor"/></marker></defs>{s.edges.map((e, i) => { const a = positions.get(e.from)!, b = positions.get(e.to)!; return <g key={i}><line x1={a.x + 65} y1={a.y + 50} x2={b.x + 65} y2={b.y} markerEnd={`url(#${arrowId})`} stroke="var(--accent,#d76942)"/><title>{`${e.from} → ${e.to}: ${e.label}`}</title></g>; })}{s.nodes.map(n => { const p = positions.get(n.id)!; return <g key={n.id} tabIndex={0}><rect x={p.x} y={p.y} width={130} height={50} rx={6} fill="var(--panel,#f6f5f0)" stroke="currentColor"/><text x={p.x + 65} y={p.y + 30} textAnchor="middle" fontSize="12">{n.label.length > 10 ? n.label.slice(0, 10) + '…' : n.label}</text><title>{`${n.id}: ${n.label}`}</title></g>; })}</svg>;
  }
  return <div className="fact-chart" data-chart-kind={fact.type}>{visual}<details open><summary>完整结构与依据</summary><ul>{s.events.map(e => <li key={e.id}>{e.date} — {e.label}</li>)}{s.nodes.map(n => <li key={n.id}>{n.id}: {n.label}</li>)}{s.edges.map((e, i) => <li key={i}>{e.from} → {e.to}: {e.label}</li>)}{s.observations.map(p => <li key={p.id}>{p.id}: {p.x} {s.x_unit}, {p.y} {s.y_unit}</li>)}</ul>{[...s.events, ...s.nodes, ...s.edges, ...s.observations].map((e, i) => <p key={i}>{e.source_id} · {e.location} · {e.quote}</p>)}</details></div>;
}
