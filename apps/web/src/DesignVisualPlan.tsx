import { Fragment, useEffect, useRef } from "react";
import { ChevronRight, X } from "lucide-react";
import type { Design, DesignIssue, Fact } from "../../../packages/shared/types";
const types = new Map([["timeline", "时间线"], ["process", "流程"], ["hierarchy", "层级"], ["scatter", "散点"], ["heading", "标题"], ["text", "文字说明"], ["bar", "条形图"], ["line", "折线图"], ["donut", "环图"], ["metric", "核心指标"], ["illustration", "插画"]]);
export function componentGroup(design: Design, component: Design["components"][number]) {
  const story = design.storyline.find(story => component.story_ids.includes(story.id));
  return story ? `story:${story.id}` : component.story_ids.length ? "unassigned" : "global";
}
export default function DesignVisualPlan({ design, issues, facts, group, selected, prefix, onGroup, onSelect, onFacts, onCheck }: {
  design: Design; issues: DesignIssue[]; facts: Fact[]; group: string; selected: string | null; prefix: string;
  onGroup: (group: string) => void; onSelect: (id: string | null) => void; onFacts: (ids: string[]) => void; onCheck: () => void;
}) {
  const map = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Selection comes from an explicit action; polling must not move the map.
    if (!selected || !map.current) return;
    const index = design.components.findIndex(component => component.id === selected);
    const item = map.current.querySelector(`[data-component-index="${index}"]`);
    if (!item) return;
    const bounds = item.getBoundingClientRect(), viewport = map.current.getBoundingClientRect();
    if (bounds.top < viewport.top || bounds.bottom > viewport.bottom) map.current.scrollTop += bounds.top - viewport.top - Math.max(0, (map.current.clientHeight - bounds.height) / 2);
  }, [selected]);
  const groups = [{ id: "global", title: "全局组件" }, ...design.storyline.map(story => ({ id: `story:${story.id}`, title: story.title })), { id: "unassigned", title: "待关联组件" }];
  const visible = design.components.filter(component => group === "all" || (group.startsWith("story:") ? component.story_ids.includes(group.slice(6)) : componentGroup(design, component) === group));
  const active = visible.find(component => component.id === selected);
  const pageValid = Number.isFinite(design.page.width) && design.page.width >= 320 && design.page.width <= 3840 && Number.isFinite(design.page.height) && design.page.height >= 320 && design.page.height <= 20000;
  const drawable = design.components.filter(({ layout: b }) => [b.x, b.y, b.width, b.height].every(Number.isFinite) && b.x >= 0 && b.y >= 0 && b.width > 0 && b.height > 0 && b.x + b.width <= design.page.width && b.y + b.height <= design.page.height);
  const componentDetail = active && <section className="dw-component-detail" aria-label="当前视觉组件"><div className="dw-section-heading"><h3>{active.title}</h3><button type="button" className="dw-icon-button" aria-label="收起组件详情" onClick={() => onSelect(null)}><X size={16} /></button></div><p>{active.description}</p><div className="dw-fact-actions">{active.fact_ids.map(id => <button type="button" key={id} onClick={() => onFacts([id])}>{facts.find(fact => fact.id === id)?.title ?? `未知事实 ${id}`}<ChevronRight size={12} /></button>)}</div>{issues.some(issue => issue.component === active.id) && <button type="button" className="dw-text-button dw-warning" onClick={onCheck}>此组件有 {issues.filter(issue => issue.component === active.id).length} 项待修问题，查看检查清单</button>}
        <details key={active.id} className="dw-advanced"><summary>布局、数据映射与交互参数</summary><dl><div><dt>位置与尺寸</dt><dd>{active.layout.x}, {active.layout.y} ／ {active.layout.width} × {active.layout.height}</dd></div><div><dt>标签与数值</dt><dd>{active.mapping.label_field || "无"} ／ {active.mapping.value_field || "无"}</dd></div><div><dt>单位</dt><dd>{active.mapping.unit || "无"}</dd></div><div><dt>所属段落</dt><dd>{active.story_ids.map(id => design.storyline.find(story => story.id === id)?.title ?? id).join("、") || "全局组件"}</dd></div><div><dt>交互</dt><dd>{active.interaction.trigger}：{active.interaction.behavior}</dd></div><div><dt>动画</dt><dd>{active.animation.trigger}：{active.animation.behavior}</dd></div></dl></details>
      </section>;
  return <div className="dw-visual-view">
    <div className="dw-visual-style"><div><strong>整体视觉方案</strong><p>{design.page.width} × {design.page.height} px <span>／ {design.font || "字体待规划"}</span></p></div><div className="dw-swatches" aria-label="设计色板">{design.palette.map((color, index) => <span key={index} style={{ backgroundColor: color }} title={color} />)}</div></div>
    <div className="dw-visual-layout"><aside className="dw-layout-aside"><h3>页面布局</h3><p className="dw-muted">按设计坐标显示的布局示意</p>{pageValid ? <div className="dw-layout-map" ref={map}><svg viewBox={`0 0 ${design.page.width} ${design.page.height}`} width={design.page.width} height={design.page.height} role="group" aria-label="设计布局示意" style={{ backgroundColor: design.page.background }}>
      {drawable.map(component => <g key={design.components.indexOf(component)} data-component-index={design.components.indexOf(component)} role="button" tabIndex={0} aria-label={`布局中选择 ${component.title}`} onClick={() => { onGroup(componentGroup(design, component)); onSelect(component.id); }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onGroup(componentGroup(design, component)); onSelect(component.id); } }}><rect x={component.layout.x} y={component.layout.y} width={component.layout.width} height={component.layout.height} fill={component.id === selected ? "var(--lime)" : "#dedfd5"} stroke={issues.some(issue => issue.component === component.id) ? "var(--accent)" : "#a7aa9c"} strokeWidth={Math.max(2, design.page.width / 280)} /><text x={component.layout.x + Math.min(12, component.layout.width / 10)} y={component.layout.y + Math.min(component.layout.height * .6, design.page.width / 28)} fontSize={Math.min(design.page.width / 34, component.layout.height * .45)} fill="var(--ink)">{component.title.slice(0, Math.max(2, Math.floor(component.layout.width / (design.page.width / 34))))}</text></g>)}
    </svg></div> : <p className="dw-muted">页面尺寸待修，暂不绘制布局。</p>}{drawable.length < design.components.length && <p className="dw-muted">{design.components.length - drawable.length} 个组件的坐标或尺寸待修，暂未绘制。</p>}</aside>
    <section className="dw-components"><div className="dw-section-heading"><h3>视觉组件</h3><select aria-label="筛选组件所属段落" value={group} onChange={event => { onGroup(event.target.value); onSelect(null); }}><option value="all">全部段落与全局组件</option>{groups.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div>
      <div className="dw-table-scroll"><table className="dw-component-table"><thead><tr><th>组件</th><th>表达形式</th><th>事实</th><th>状态</th></tr></thead>{groups.map(item => {
        const rows = visible.filter(component => group === "all" ? componentGroup(design, component) === item.id : item.id === group);
        if (!rows.length) return null;
        return <tbody key={item.id}><tr className="dw-group-row"><th colSpan={4}>{item.title}</th></tr>{rows.map(component => <Fragment key={design.components.indexOf(component)}><tr id={`${prefix}-component-${design.components.indexOf(component)}`} className={component.id === selected ? "selected" : ""}><td><button type="button" className="dw-component-select" aria-pressed={component.id === selected} onClick={() => onSelect(component.id)}><strong>{component.title}</strong><small>{component.id}{component.story_ids.length > 1 && ` · 关联 ${component.story_ids.length} 段`}</small></button></td><td>{types.get(component.type) ?? "类型待修"}</td><td>{component.fact_ids.length}</td><td><span className={issues.some(issue => issue.component === component.id) ? "dw-warning" : "dw-muted"}>{issues.some(issue => issue.component === component.id) ? "待修正" : "预检通过"}</span></td></tr>{component.id === selected && <tr className="dw-component-detail-row"><td colSpan={4}>{componentDetail}</td></tr>}</Fragment>)}</tbody>;
      })}</table></div>{!visible.length && <p className="dw-empty-note">该范围尚未保存视觉组件。</p>}

    </section></div>
    {design.assets.length > 0 && <details className="dw-advanced"><summary>设计素材 · {design.assets.length}</summary>{design.assets.map((asset, index) => <div className="dw-asset" key={index}><strong>{asset.purpose}</strong><p>{asset.width} × {asset.height} ／ {asset.style}</p><p>{asset.prompt}</p></div>)}</details>}
  </div>;
}
