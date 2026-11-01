import StructureChart from "./StructureChart";
import { structuralTypes } from "../../../packages/shared/structure";
import { useId, useState, type KeyboardEvent } from "react";
import { arc, pie } from "d3";
import type { Fact } from "../../../packages/shared/types";
import { cartesianChart } from "../../../packages/shared/chart-geometry";
import { hasMixedUnits } from "../../../packages/shared/units";

export function hasFactChart(fact: Fact) {
  return structuralTypes.includes(fact.type as typeof structuralTypes[number]) || (fact.type === "proportion" ? typeof fact.value === "number" && fact.unit === "%" && fact.value >= 0 && fact.value <= 100 : ["trend", "distribution", "comparison", "rank", "extreme", "outlier", "categorization"].includes(fact.type) && fact.series.length > 0 && !hasMixedUnits(fact.specification?.series_unit ?? fact.unit));
}
export default function FactChart({ fact }: { fact: Fact }) {
  const titleId = useId(), [active, setActive] = useState<number | null>(null);
  if (structuralTypes.includes(fact.type as typeof structuralTypes[number])) return <StructureChart fact={fact}/>;
  const unit = fact.type === "proportion" ? "%" : fact.specification?.series_unit ?? fact.unit;
  const focus = new Set((fact.specification?.focus ?? "").split(/[、，,；;]/).map(label => label.trim()));
  const percentage = fact.type === "proportion";
  const data = percentage ? [{ label: "占比", value: Number(fact.value) }, { label: "其余（补足 100%）", value: 100 - Number(fact.value) }] : fact.series;
  const datum = active === null ? undefined : data[active];
  const select = (index: number) => ({ tabIndex: 0, "data-chart-point": index, "aria-label": `${data[index].label}：${data[index].value} ${unit}`, onMouseEnter: () => setActive(index), onMouseLeave: () => setActive(null), onFocus: () => setActive(index), onBlur: () => setActive(null), onKeyDown: (event: KeyboardEvent<SVGGElement>) => {
    const target = event.key === "ArrowRight" || event.key === "ArrowDown" ? index + 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? index - 1 : event.key === "Home" ? 0 : event.key === "End" ? data.length - 1 : -1;
    if (target >= 0 && target < data.length) { event.preventDefault(); (event.currentTarget.parentElement?.querySelector(`[data-chart-point="${target}"]`) as SVGElement | null)?.focus(); }
  } });
  let chart: ReturnType<typeof cartesianChart> | undefined, problem: string | undefined;
  if (!percentage) try { chart = cartesianChart(data, fact.type === "trend" ? "line" : fact.type === "rank" ? "rank" : "bar"); }
  catch (error) { problem = error instanceof Error ? error.message : String(error); }
  const arcs = percentage ? pie<{ label: string; value: number }>().sort(null).value(item => item.value)(data) : [];
  const shape = arc<(typeof arcs)[number]>().innerRadius(48).outerRadius(68);
  return <div className="fact-chart" data-chart-engine="d3" data-chart-kind={percentage ? "donut" : fact.type === "trend" ? "line" : "bar"}>
    {problem ? <p className="fact-chart-error" role="status">{problem}</p> : <div className="fact-chart-scroll"><svg viewBox={percentage ? "0 0 380 180" : `0 0 ${chart!.width} ${chart!.height}`} role="img" aria-labelledby={titleId}>
      <title id={titleId}>{`${fact.title}，单位：${unit}`}</title><desc>{percentage ? "占比与补足百分之百的其余部分。" : chart!.elapsedTime ? "横坐标按真实时间间隔映射，数值和顺序来自原始序列。" : "按原始序列顺序展示，不合并同名标签。"}</desc>
      {percentage ? <><g transform="translate(190,78)">{arcs.map((item, index) => <g key={index} {...select(index)}><path d={shape(item) ?? undefined} fill={index === 0 ? "#a7bc69" : "#dfe3d6"} stroke="var(--panel)" strokeWidth={2} /><title>{`${item.data.label}：${item.data.value}%`}</title></g>)}<text textAnchor="middle" y={7} className="fact-chart-percentage">{fact.value}%</text></g><text x={190} y={171} textAnchor="middle" className="fact-chart-caption">其余部分为补足 100% 的数学余量</text></> : <>
        {chart!.ticks.map((tick, index) => <g key={index}><line x1={chart!.horizontal ? tick.position : chart!.left} x2={chart!.horizontal ? tick.position : chart!.right} y1={chart!.horizontal ? chart!.top : tick.position} y2={chart!.horizontal ? chart!.bottom : tick.position} className="fact-chart-grid" /><text x={chart!.horizontal ? tick.position : chart!.left - 8} y={chart!.horizontal ? chart!.bottom + 18 : tick.position + 3} textAnchor={chart!.horizontal ? "middle" : "end"} className="fact-chart-tick">{tick.label}</text></g>)}
        {fact.type !== "trend" && <line x1={chart!.horizontal ? chart!.zero : chart!.left} x2={chart!.horizontal ? chart!.zero : chart!.right} y1={chart!.horizontal ? chart!.top : chart!.zero} y2={chart!.horizontal ? chart!.bottom : chart!.zero} className="fact-chart-zero" />}
        {chart!.path && <path d={chart!.path} className="fact-chart-line" />}
        {chart!.points.map(point => <g key={point.index} {...select(point.index)}>{fact.type === "trend" ? <circle cx={point.x} cy={point.y} r={active === point.index ? 5 : 3.5} fill={focus.has(point.label) || point.index === data.length - 1 ? "#a7bc69" : "#d76942"} /> : <rect x={point.x} y={point.y} width={point.width} height={point.height} rx={2} fill={focus.has(point.label) ? "#a7bc69" : "#d76942"} />}<title>{`${point.label}：${point.value} ${unit}`}</title></g>)}
        {chart!.labels.map(label => <text key={label.index} x={chart!.horizontal ? chart!.left - 8 : label.position} y={chart!.horizontal ? label.position + 3 : chart!.bottom + 20} textAnchor={chart!.horizontal ? "end" : "middle"} className="fact-chart-tick"><title>{label.label}</title>{label.label.length > (chart!.horizontal ? 12 : 9) ? label.label.slice(0, chart!.horizontal ? 11 : 8) + "…" : label.label}</text>)}
      </>}
    </svg></div>}
    {!problem && <output className="fact-chart-readout" aria-live="polite">{datum ? `${datum.label}：${datum.value} ${unit}` : "指向图形或使用键盘查看数值"}</output>}
    <details className="fact-chart-data"><summary>查看图表数据</summary><table><thead><tr><th>标签</th><th>原始数值</th></tr></thead><tbody>{data.map((item, index) => <tr key={index}><td>{item.label}</td><td>{item.value} {unit}</td></tr>)}</tbody></table></details>
  </div>;
}
