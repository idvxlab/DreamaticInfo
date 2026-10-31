import { hasMixedUnits } from "../../../packages/shared/units.js";
import { verifyCalculation } from "./source-calculation.js";
import type { Project, Research, AnalysisIssue } from "../../../packages/shared/types.js";
import { schemaErrors } from "./validation.js";
import { loadEvidenceSource, matchingEvidence, type EvidenceSource } from "./evidence-view.js";
export type { AnalysisIssue } from "../../../packages/shared/types.js";
const labels: Record<string, string> = { facts: "数据事实", relations: "关联", evidence: "证据", source_ids: "来源编号列表", source_id: "来源编号", type: "类型", quote: "原文", location: "位置", target_id: "目标事实编号", basis: "依据", value: "数值", importance: "重要程度", derivation: "依据方式", specification: "统计口径", calculation_id: "计算记录编号", method: "方法", distribution_kind: "分布类别", measure: "度量字段", breakdown: "分组字段", aggregation: "聚合方法", focus: "关注对象", scope: "数据范围", confidence: "可信度", score: "分数", series: "数值序列" };
export async function analystIssues(p: Project, data: any, research: Research, evidence?: Map<string, EvidenceSource>): Promise<AnalysisIssue[]> {
  const issues: AnalysisIssue[] = [], facts = Array.isArray(data?.facts) ? data.facts : [];
  for (const error of schemaErrors("datafacts", data)) {
    const parts = error.instancePath.split("/").slice(1), fact = parts[0] === "facts" ? facts[Number(parts[1])]?.id : undefined;
    const location = parts.map((part, i) => /^\d+$/.test(part) ? i === 1 && fact ? String(fact) : `第 ${Number(part) + 1} 条` : labels[part] ?? part).join("／") || "文档";
    issues.push({ fact, location, message: error.keyword === "enum" ? `实际值 ${JSON.stringify(parts.reduce((value, key) => value?.[key], data))} 不属于允许值` : `${error.message ?? "格式不符合约定"}`, fix: error.keyword === "enum" ? `允许值：${error.params.allowedValues.join("、")}；${parts.includes("relations") ? "这是关联类型，不可填入事实类型；无依据则删除关联" : parts.at(-1) === "type" ? "这是事实类型，依据方式在 derivation 中单独填写" : "使用本字段的允许值，不自行创造别名"}` : `修正该字段；约束：${JSON.stringify(error.params)}` });
  }
  if (!facts.length) issues.push({ location: "数据事实", message: "没有数据事实", fix: "至少保留一条有可追溯证据的事实" });
  const ids = new Set(facts.map((fact: any) => fact.id)), known = new Map(research.sources.map(source => [source.id, source])), seen = new Set<string>();
  const sources = evidence ?? new Map<string, EvidenceSource>();
  for (const fact of facts) {
    const add = (location: string, message: string, fix: string) => issues.push({ fact: fact.id, location: `${fact.id}／${location}`, message, fix });
    if (!fact.id?.trim() || seen.has(fact.id)) add("编号", "事实编号为空或重复", "使用非空且唯一的事实编号");
    seen.add(fact.id);
    if (!fact.source_ids?.length || !fact.evidence?.length) add("证据", "缺少来源或证据", "从来源目录复制编号，通过 read_evidence 读取逐字证据");
    for (const id of fact.source_ids ?? []) if (!known.has(id)) add("来源编号列表", `未知来源编号 ${id}`, "使用 read_source_catalog 给出的原始编号，不重命名为 S-01 等别名");
    for (const [index, item] of (fact.evidence ?? []).entries()) {
      const where = `第 ${index + 1} 条证据`;
      if (!known.has(item.source_id)) { add(where, `未知来源编号 ${item.source_id}`, "复制目录中的原始来源编号"); continue; }
      if (!fact.source_ids.includes(item.source_id)) add(where, "证据来源不在本事实来源列表中", "将该原始编号加入来源编号列表");
      if (!item.quote?.trim() || !item.location?.trim()) { add(where, "缺少原文或位置", "复制证据块原文，在位置中保留 E-… 证据块编号"); continue; }
      try {
        if (!sources.has(item.source_id)) sources.set(item.source_id, await loadEvidenceSource(p, known.get(item.source_id)!));
        if (!matchingEvidence(sources.get(item.source_id)!, item.quote, item.location)) add(where, `引文不在对应来源中（需匹配同一证据块）：${item.quote.slice(0, 180)}`, `调用 read_evidence，source_id=${item.source_id}；复制原文及证据块编号，不增添冒号、年份或拼接单元格`);
      } catch (error) { add(where, `来源文件无法核验：${String(error)}`, "检查该来源文件，不得改用其他来源代替此编号"); }
    }
    const spec = fact.specification;
    if (spec) {
      if (fact.series?.length && typeof spec.series_unit === "string" && hasMixedUnits(spec.series_unit)) add("序列单位", `数值序列包含混合单位：${spec.series_unit}`, "按单位拆成独立事实与序列，保留来源和证据；不能只改单位名称，不能将百分比、人数或 OR 共用同一数值轴");
      if (fact.type === "distribution" && !["categorical", "numeric"].includes(spec.distribution_kind)) add("分布类别", "分布事实必须明确类别分布或数值分布", "选择 categorical 或 numeric，并说明分组或分箱规则");
      if (fact.type !== "distribution" && spec.distribution_kind !== "none") add("分布类别", "该事实不是分布类型", "填写 none");
      if (["proportion", "categorization", "rank", "extreme", "outlier"].includes(fact.type) && (!spec.focus?.trim() || /^(无|未提供|none)$/i.test(spec.focus))) add("关注对象", "该类型需要明确关注对象或类别集合", "说明完整统计范围及关注对象；排名处理并列，异常注明方法，分类不等于聚类");
      if (fact.type === "proportion" && (typeof fact.value !== "number" || fact.value < 0 || fact.value > 100 || fact.unit !== "%")) add("数值", "占比必须是 0–100 的数值且单位为 %", "核实分子、分母与范围；不要将变化率当作占比");
      if (fact.type === "rank" && (!Number.isInteger(fact.value) || fact.value < 1)) add("数值", "排名必须是从 1 开始的整数", "一条事实明确一个对象的名次，Top 列表通过完整排序序列表达");
      if (fact.type === "categorization" && (!Number.isInteger(fact.value) || fact.value < 0)) add("数值", "类别数量必须是非负整数", "使用去重计数或引用原文类别数量，不声称已执行自动聚类");
      if (["extreme", "outlier"].includes(fact.type) && (typeof fact.value !== "number" || !Number.isFinite(fact.value))) add("数值", "极值及异常事实需保留关注对象的实际数值", "异常分数写入分析，不能以分数代替原始观测值");
      if (fact.type === "correlation") {
        const unit = typeof fact.unit === "string" ? fact.unit.trim().toLowerCase().replace(/\s+/g, " ") : "";
        const coefficient = ["r", "pearson r", "ρ", "rho", "spearman rho", "τ", "tau", "kendall tau"].includes(unit);
        const ratio = ["or", "aor", "adjusted or", "odds ratio", "优势比", "rr", "adjusted rr", "risk ratio", "relative risk", "相对风险", "hr", "ahr", "adjusted hr", "hazard ratio", "风险比"].includes(unit);
        if (!coefficient && !ratio) add("单位", "关联事实未明确支持的统计指标", "相关系数单位填写 r、ρ 或 τ；来源引用的优势比/相对风险/风险比填写 OR、RR 或 HR，在方法中说明模型和调整口径；不得混用或仅修改数值过关");
        if (typeof fact.value !== "number" || !Number.isFinite(fact.value)) add("数值", "关联指标必须是有限数值", "按来源保留实际指标值；无可用指标时不能填写文字或编造数值");
        else if (coefficient && (fact.value < -1 || fact.value > 1)) add("数值", "相关系数必须在 -1 至 1 之间", "核实相关方法和成对样本；OR/RR/HR 不是相关系数，必须保留实际指标单位；关联不能作为因果证据");
        else if (ratio && fact.value < 0) add("数值", "OR/RR/HR 比值指标不能为负数", "核实来源的比值、参照组与调整口径；不要将对数系数当作比值，关联不能作为因果证据");
      }
      if (["inferred", "forecast"].includes(fact.derivation) && (!fact.context?.trim() || !fact.analysis?.trim())) add("依据方式", "推断或预测需要明确假设与限制", "保留真实来源，说明假设和不确定性，不作为已观察结果");
      if (fact.derivation === "computed") { try { await verifyCalculation(p, fact, sources); } catch (error) { add("计算记录", String(error instanceof Error ? error.message : error), "使用 calculate 的 source_id、block_id 和列号执行来源计算，原样复制返回的数值、序列与统计口径"); } }
      else if (spec.calculation_id !== null) add("依据方式", "非确定性计算事实不能冒用计算记录", "引用结果填写 quoted 与空计算编号；独立复算结果填写 computed");
    }
    for (const [index, relation] of (fact.relations ?? []).entries()) if (!ids.has(relation.target_id) || relation.target_id === fact.id || !relation.basis?.trim()) add(`第 ${index + 1} 条关联`, "目标事实不存在、指向自身或缺少依据", "指向已有的其他事实并说明依据；无依据则删除");
  }
  return issues;
}
const cell = (text: string) => text.replaceAll("|", "\\|").replace(/\r?\n/g, " ");
export function analysisReport(issues: AnalysisIssue[], verified: string[] = []) {
  return `# Analyst 草稿校验\n\n${issues.length ? `未通过，共 ${issues.length} 项问题。仅修正以下位置，不必重写整份报告。` : "预检通过；尚未正式提交，最终提交仍会完整核验。"}\n\n已通过的事实：${verified.join("、") || "无"}\n\n` + (issues.length ? "| 位置 | 问题 | 修正要求 |\n| --- | --- | --- |\n" + issues.map(issue => `| ${cell(issue.location)} | ${cell(issue.message)} | ${cell(issue.fix)} |`).join("\n") : "");
}
