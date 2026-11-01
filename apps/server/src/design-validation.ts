import type { DataFacts, Design, DesignIssue } from "../../../packages/shared/types.js";
import { hasMixedUnits } from "../../../packages/shared/units.js";

/** Shared by draft inspection and formal submission: report every affected item. */
export function designReferenceIssues(d: Design, facts: DataFacts): DesignIssue[] {
  const issues: DesignIssue[] = [], known = new Map(facts.facts.map(fact => [fact.id, fact]));
  const storyIds = new Set<string>(), componentIds = new Set<string>(), assetIds = new Set<string>();
  if (!d.narrative_rationale.trim()) issues.push({ location: "整体编排依据", message: "整体编排依据为空", fix: "说明叙事主线及展开顺序，不填写纯空白" });
  for (const story of d.storyline) {
    const add = (field: string, message: string, fix: string) => issues.push({ story: story.id, location: `段落 ${story.id}／${field}`, message, fix });
    if (!story.id.trim() || storyIds.has(story.id)) add("编号", "段落编号为空或重复", "保留非空且唯一的段落编号");
    storyIds.add(story.id);
    if (!story.rationale.trim()) add("选材与顺序理由", "段落编排理由为空", "说明选取事实和安排顺序的理由");
    for (const id of story.fact_ids) if (!known.has(id)) add("事实编号列表", `未知事实 ${id}`, "仅引用正式 datafacts.md 中的编号；空列表单独写无，不与真实编号混写");
  }
  for (const c of d.components) {
    const add = (field: string, message: string, fix: string) => issues.push({ component: c.id, location: `组件 ${c.id}（${c.title}）／${field}`, message, fix });
    if (!c.id.trim() || componentIds.has(c.id)) add("编号", "组件编号为空或重复", "使用非空且唯一的组件编号");
    componentIds.add(c.id);
    for (const id of c.asset_ids ?? []) if (!d.assets.some(asset => asset.id === id)) add("素材引用", `未知素材 ${id}`, "引用正式素材编号");
    for (const id of c.fact_ids) if (!known.has(id)) add("事实编号列表", `未知事实 ${id}`, `用 patch_design_component 修正 ${c.id}；仅引用正式事实，空编号列表单独写无`);
    for (const id of c.story_ids) if (!storyIds.has(id)) add("段落编号列表", `未知段落 ${id}`, "填写现有故事线的段落编号，不填组件编号");
    if (c.fact_ids.length && (!c.story_ids.length || c.fact_ids.some(id => !d.storyline.some(story => c.story_ids.includes(story.id) && story.fact_ids.includes(id))))) add("段落与事实", "组件事实不属于所关联段落", "补齐段落编号列表，并使组件事实属于关联段落的事实集合");
    const chart = ["bar", "line", "donut"].includes(c.type);
    if ((chart || c.type === "metric") && !c.fact_ids.length) add("数据映射", "图表或指标未引用事实", "引用正式事实编号；非数据内容应使用 heading/text 等组件");
    if (c.type === "metric" && c.mapping.value_field !== "value") add("数据映射", `指标数值字段实际为 ${c.mapping.value_field}`, "指标的数值字段须为 value");
    if (chart && (c.mapping.label_field !== "series.label" || c.mapping.value_field !== "series.value")) add("数据映射", `图表字段实际为 ${c.mapping.label_field} / ${c.mapping.value_field}`, "标签字段为 series.label，数值字段为 series.value");
    for (const id of c.fact_ids) {
      const fact = known.get(id); if (!fact) continue;
      if (c.type === "metric") {
        if (hasMixedUnits(fact.unit)) add("指标单位", `${id} 核心数值单位混合：${fact.unit}`, "请 Analyst 核实并拆分指标；不要修改单位文字伪装成单一指标");
        else if (c.mapping.unit !== fact.unit) add("指标单位", `${id}：实际单位“${c.mapping.unit}”，要求核心数值单位“${fact.unit}”`, "原样使用该事实核心数值及其单位，不使用序列单位代替");
      }
      if (!chart) continue;
      const unit = fact.specification.series_unit;
      if (hasMixedUnits(unit)) add("序列单位", `${id} 是混合单位序列“${unit}”，组件实际单位“${c.mapping.unit}”；不能放在同一数值轴或环图中`, `不要将映射单位改为“${unit}”以通过校验。可改用 metric 展示 ${id} 的已核验核心数值（单位“${fact.unit}”），或用 text 说明限制；如需多个图表，请 Analyst 按单位拆分事实并保留证据，不猜测、过滤或换算原序列。`);
      else if (c.mapping.unit !== unit) add("序列单位", `${id}：实际单位“${c.mapping.unit}”，要求序列单位“${unit}”`, "图表须使用统计口径中的序列单位，不能使用名次等核心数值单位代替");
      if (!fact.series.length) add("数值序列", `${id} 没有可用数值序列`, "改用核心指标 metric 或有完整同单位序列的事实，不编造数值");
      if (c.type === "donut" && (fact.series.some(item => item.value < 0) || fact.series.reduce((sum, item) => sum + item.value, 0) <= 0)) add("环图", `${id} 不满足非负且总和为正的要求`, "选用真实构成整体的数据，或更换图表类型");
    }
    if (c.parent_id && !d.components.some(parent => parent.id === c.parent_id)) add("父组件", `未知父组件 ${c.parent_id}`, "使用现有组件编号，顶层组件填未提供");
    const ancestors = new Set([c.id]); let parent = c.parent_id;
    while (parent) {
      if (ancestors.has(parent)) { add("父组件", "组件父级存在循环", "断开循环，不得将组件置于自身后代中"); break; }
      ancestors.add(parent); parent = d.components.find(item => item.id === parent)?.parent_id ?? null;
    }
    const b = c.layout;
    if (b.width <= 0 || b.height <= 0 || b.x < 0 || b.y < 0 || b.x + b.width > d.page.width || b.y + b.height > d.page.height) add("布局", `位置 ${b.x},${b.y}，尺寸 ${b.width}×${b.height} 超出页面 ${d.page.width}×${d.page.height}`, "使用正尺寸，组件须完整位于页面内");
  }
  for (const asset of d.assets) {
    if (!asset.id.trim() || assetIds.has(asset.id)) issues.push({ location: `素材 ${asset.id}／编号`, message: "素材编号为空或重复", fix: "使用非空且唯一的素材编号" });
    assetIds.add(asset.id);
    if (asset.width <= 0 || asset.height <= 0) issues.push({ location: `素材 ${asset.id}`, message: "素材尺寸须为正", fix: "指定有效尺寸" });
    const commission = asset.commission;
    if (commission) {
      for (const id of commission.content_ids) if (!known.has(id)) issues.push({ location: `素材 ${asset.id}`, message: `未知事实 ${id}`, fix: "关联正式事实编号" });
      if (commission.semantics !== "decorative" && !commission.content_ids.length) issues.push({ location: `素材 ${asset.id}`, message: "信息性素材缺少事实依据", fix: "关联正式事实，不借插画编造结构或数据" });
      if (commission.semantics === "data") issues.push({ location: `素材 ${asset.id}`, message: "精确数据编码不能交给图像生成", fix: "改用有正式映射的代码组件" });
      if (!d.components.some(component => component.asset_ids?.includes(asset.id))) issues.push({ location: `素材 ${asset.id}`, message: "委托素材未被组件引用", fix: "添加使用关系或删除不必要委托" });
    }
  }
  return issues;
}
