import type { Fact } from './types.js';
export const structuralTypes = ['timeline', 'process', 'hierarchy', 'scatter'] as const;
/** Strict date precision with calendar validation; UTC prevents locale/timezone drift. */
export function eventTime(value: string): number {
  if (!/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(value)) return NaN;
  const [y, m = 1, d = 1] = value.split('-').map(Number);
  const date = new Date(0); date.setUTCFullYear(y, m - 1, d); date.setUTCHours(0, 0, 0, 0);
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date.getTime() : NaN;
}
export function structureIssues(f: Fact): string[] {
  const structured = structuralTypes.includes(f.type as typeof structuralTypes[number]);
  if (!structured) return f.structure ? ['统计事实不能附带无关结构数据'] : [];
  const s = f.structure;
  if (!s) return ['缺少结构数据'];
  const issues: string[] = [];
  const unique = (items: { id: string }[]) => items.every(x => x.id.trim()) && new Set(items.map(x => x.id)).size === items.length;
  if (f.series.length || f.derivation === 'computed') issues.push('结构事实不使用统计序列或统计计算凭据');
  const evidence = [...s.events, ...s.nodes, ...s.edges, ...s.observations];
  if (evidence.some(x => !f.source_ids.includes(x.source_id) || !x.quote.trim() || !x.location.trim())) issues.push('每条结构记录必须有本事实来源中的原文证据');
  if (f.type === 'timeline') {
    if (!s.events.length || !unique(s.events)) issues.push('时间线事件编号须非空唯一');
    if (s.events.some(x => !Number.isFinite(eventTime(x.date)))) issues.push('事件日期无效，使用 YYYY、YYYY-MM 或 YYYY-MM-DD');
    if (s.events.some((x, i) => i && eventTime(x.date) < eventTime(s.events[i - 1].date))) issues.push('事件须按真实日期排序，允许同时发生');
  } else if (s.events.length) issues.push('非时间线不得填事件');
  if (f.type === 'scatter') {
    if (!s.observations.length || !unique(s.observations)) issues.push('配对观测编号须非空唯一');
    if (![s.x_variable, s.y_variable, s.x_unit, s.y_unit].every(x => x.trim())) issues.push('成对变量及各自单位必填，无量纲须明确填写');
    if (s.observations.some(x => !Number.isFinite(x.x) || !Number.isFinite(x.y))) issues.push('每条观测必须有真实有限 x/y 值');
  } else if (s.observations.length || [s.x_variable, s.y_variable, s.x_unit, s.y_unit].some(Boolean)) issues.push('非散点不得填写配对变量');
  if (f.type === 'process' || f.type === 'hierarchy') {
    if (!s.nodes.length || !unique(s.nodes)) issues.push('节点编号须非空唯一');
    const ids = new Set(s.nodes.map(x => x.id)), pairs = new Set<string>();
    for (const e of s.edges) {
      const pair = JSON.stringify([e.from, e.to]);
      if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to || pairs.has(pair) || !e.label.trim()) issues.push('连线须引用不同现有节点、语义非空且不得重复');
      pairs.add(pair);
    }
    if (f.type === 'hierarchy') {
      const parents = new Map<string, string>();
      for (const e of s.edges) { if (parents.has(e.to)) issues.push('层级节点只能有一个父级'); parents.set(e.to, e.from); }
      for (const id of ids) { const seen = new Set<string>(); let cursor: string | undefined = id; while (cursor) { if (seen.has(cursor)) { issues.push('层级不得循环'); break; } seen.add(cursor); cursor = parents.get(cursor); } }
      if (s.edges.length !== s.nodes.length - 1) issues.push('层级必须是单根连通树');
    }
  } else if (s.nodes.length || s.edges.length) issues.push('非流程/层级不得填节点和连线');
  return [...new Set(issues)];
}
