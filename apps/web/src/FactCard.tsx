import { hasMixedUnits } from "../../../packages/shared/units";
import { factTypeLabels, factBasisLabels } from "../../../packages/shared/fact-types";
import { ArrowUpRight, ChevronRight, FileText, Link2 } from "lucide-react";
import type { Fact, ProjectDetail } from "../../../packages/shared/types";



export default function FactCard({
  fact: f,
  index,
  project,
  linked,
  onLink,
  draft = false,
  relatedFacts,
}: {
  fact: Fact;
  index: number;
  project: ProjectDetail;
  linked: boolean;
  onLink: () => void;
  draft?: boolean;
  relatedFacts?: Fact[];
}) {
  const mixedUnits = hasMixedUnits(f.specification?.series_unit ?? f.unit);
  const series = f.series,
    upper = Math.max(0, ...series.map((s) => s.value)),
    lower = Math.min(0, ...series.map((s) => s.value));
  const yFor = (value: number) =>
    76 - ((value - lower) / Math.max(1, upper - lower)) * 58;
  const zeroY = yFor(0);
  const focusLabels = new Set(f.specification?.focus.split("、") ?? []);
  const hasFocusedSeries = series.some(item => focusLabels.has(item.label));
  return (
    <article className={`fact-card ${linked ? "linked" : ""}`}>
      <div className="fact-card-top">
        <span className="fact-number">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="fact-type">
          {factTypeLabels.get(f.type) ?? "类型待修正"}
        </span>
        <span className="fact-confidence" title={f.confidence.reason}>
          {Number.isFinite(f.confidence.score) && f.confidence.score >= 0 && f.confidence.score <= 1 ? `${draft ? "模型自评" : "可信度"} ${Math.round(f.confidence.score * 100)}%` : "可信度待修正"}
        </span>
      </div>
      <div className="fact-derivation"><span className={`fact-basis ${f.derivation}`}>{factBasisLabels.get(f.derivation) ?? "依据方式待补充"}</span>{f.specification?.focus && <small>关注：{f.specification.focus}</small>}</div>
      {["rank", "extreme", "outlier"].includes(f.type) && <p className="fact-key-result">{f.type === "rank" ? "名次" : f.type === "extreme" ? "极值" : "异常观测"}：{f.value} {f.unit}</p>}
      <div className="fact-visual">
        {(["trend", "distribution", "rank", "extreme", "outlier"].includes(f.type)) &&
        series.length > 0 && !mixedUnits ? (
          <svg viewBox="0 0 300 100" role="img" aria-label={f.title}>
            <title>{f.title}</title>
            <line
              x1="16"
              x2="284"
              y1={zeroY}
              y2={zeroY}
              stroke="#ccd4bc"
              strokeWidth="0.6"
            />
            {series.map((s, i) => (
              <g key={i}>
                <rect
                  x={20 + i * (260 / Math.max(series.length, 1))}
                  y={Math.min(zeroY, yFor(s.value))}
                  width={Math.min(36, 220 / Math.max(series.length, 1))}
                  height={Math.abs(yFor(s.value) - zeroY)}
                  rx="3"
                  fill={(hasFocusedSeries ? focusLabels.has(s.label) : i === series.length - 1) ? "#a7bc69" : "#d76942"}
                />
                <text
                  x={20 + i * (260 / Math.max(series.length, 1))}
                  y="94"
                  fontSize="9"
                  fill="#85877f"
                >
                  {s.label}
                </text>
                <title>
                  {s.label}: {s.value} {f.specification?.series_unit ?? f.unit}
                </title>
              </g>
            ))}
          </svg>
        ) : (
          <div className="fact-value">
            {f.value}
            <small>{f.unit}</small>
          </div>
        )}
      </div>
      {f.type === "proportion" && typeof f.value === "number" && f.value >= 0 && f.value <= 100 && <div className="fact-proportion-track" aria-label={`占比 ${f.value}%`}><span style={{ width: `${f.value}%` }} /></div>}
      {f.series.length > 0 && <small className="fact-series-unit">序列单位：{f.specification?.series_unit ?? f.unit}</small>}
      {mixedUnits && series.length > 0 && <details className="fact-unit-warning"><summary>混合单位序列，暂不绘制同轴图表</summary><p>请按单位拆分事实。以下仅保留原始标签和值，不猜测单位、不换算或删减数据。</p><table><thead><tr><th>原始标签</th><th>数值</th></tr></thead><tbody>{series.map((item, i) => <tr key={i}><td>{item.label}</td><td>{item.value}</td></tr>)}</tbody></table></details>}
      <h3>{f.title}</h3>
      <p>{f.description}</p>
      <div className="fact-analysis">{f.analysis}</div>
      {f.specification && <details className="fact-specification"><summary>统计口径与方法 <ChevronRight size={12} /></summary><dl>{[["范围", f.specification.scope], ["度量", f.specification.measure], ["分组", f.specification.breakdown], ["聚合", f.specification.aggregation], ["方法", f.specification.method], ["分布类别", f.specification.distribution_kind], ["计算记录", f.specification.calculation_id ?? "无独立计算记录"]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></details>}
      <details>
        <summary>
          查看依据 <ChevronRight size={12} />
        </summary>
        {f.evidence.map((e, i) => (
          <blockquote key={i}>
            <p>{e.quote}</p>
            <small>{e.location}</small>
          </blockquote>
        ))}
        <p className="confidence-reason">{f.confidence.reason}</p>
      </details>
      <div className="fact-source">
        <FileText size={12} />
        <span>
          {f.source_ids
            .map(
              (id) =>
                project.research?.sources.find((s) => s.id === id)?.title || id,
            )
            .join(" · ")}
        </span>
      </div>
      {linked && (
        <div className="fact-relations">
          {f.relations.map((r) => (
            <p key={r.target_id}>
              <b>
                {(relatedFacts ?? project.datafacts?.facts)?.find((x) => x.id === r.target_id)
                  ?.title || r.target_id}
              </b>
              <br />
              {r.type} · {r.basis}
            </p>
          ))}
        </div>
      )}
      {f.relations.length > 0 && (
        <button className="relation-button" onClick={onLink}>
          <Link2 size={12} />
          {linked ? "显示全部事实" : `${f.relations.length} 个关联事实`}
          <ArrowUpRight size={12} />
        </button>
      )}
    </article>
  );
}
