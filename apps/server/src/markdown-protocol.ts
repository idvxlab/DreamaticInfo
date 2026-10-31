/** Markdown is the authored artifact; objects below are deterministic internal indexes. */
import type { Role } from "../../../packages/shared/types.js";
import { schemas, names, validate } from "./validation.js";
export const DOCUMENT_PROTOCOL = "markdown-v1";
type Schema = { type: string | string[]; minimum?: number; maximum?: number; properties?: Record<string, Schema>; items?: Schema; enum?: string[] };
const labels: Record<string, string> = {
  narrative_rationale: "整体编排依据", rationale: "选材与顺序理由", story_ids: "段落编号列表",
  series_unit: "序列单位", derivation: "依据方式", specification: "统计口径", measure: "度量字段", breakdown: "分组字段", focus: "关注对象", method: "方法", aggregation: "聚合方法", distribution_kind: "分布类别", calculation_id: "计算记录编号",
  intent: "需求报告", research: "调研报告", datafacts: "数据事实报告", design: "逻辑与叙事设计",
  title: "标题", topic: "主题", objective: "项目目标", audience: "目标受众", scope: "内容范围", data_requirements: "数据要求", story_direction: "叙事方向", visual_preferences: "视觉偏好", constraints: "约束", summary: "概要", sources: "来源", datasets: "数据集", limitations: "局限", id: "编号", url: "链接", published_at: "发布日期", accessed_at: "采集日期", kind: "来源类型", path: "文件路径", fields: "字段", source_id: "来源编号", description: "描述", facts: "数据事实", type: "类型", value: "数值", unit: "单位", evidence: "证据", quote: "原文", location: "位置", analysis: "分析", context: "上下文", source_ids: "来源编号列表", importance: "重要程度", relations: "关联", target_id: "目标事实编号", basis: "依据", confidence: "可信度", score: "分数", reason: "理由", series: "数值序列", label: "标签", theme: "主题", storyline: "故事线", fact_ids: "事实编号列表", page: "页面", width: "宽度", height: "高度", background: "背景", palette: "色板", font: "字体", components: "组件", parent_id: "父组件编号", layout: "布局", x: "横坐标", y: "纵坐标", mapping: "数据映射", label_field: "标签字段", value_field: "数值字段", interaction: "交互", animation: "动画", trigger: "触发", behavior: "行为", assets: "素材", purpose: "用途", style: "风格", prompt: "生成描述",
};
const label = (key: string) => labels[key] || key;
const scalar = (s: Schema) => s.type !== "object" && s.type !== "array";
const schemaFor = (role: Role): Schema => role === "builder" ? { type: "object", properties: { summary: { type: "string" } } } : schemas[names[role]] as Schema;
const encode = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("|", "&#124;").replaceAll("`", "&#96;").replaceAll("\r", "&#13;").replaceAll("\n", "<br>").replace(/^[ \t]+|[ \t]+$/g, value => value.replaceAll(" ", "&#32;").replaceAll("\t", "&#9;"));
const decode = (s: string) => s.replace(/<br\s*\/?\s*>/gi, "\n").replaceAll("\\|", "|").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
function cell(value: unknown, schema: Schema) {
  if (value === null) return "未提供";
  if (typeof value === "number") return String(value);
  const text = encode(String(value ?? ""));
  if (!text) return "``";
  return Array.isArray(schema.type) && (schema.type.includes("number") || text === "未提供") ? `\`${text}\`` : text;
}
function value(text: string, schema: Schema, where: string): unknown {
  const raw = text.trim(), types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.includes("null") && raw === "未提供") return null;
  if (types.includes("string") && raw.startsWith("`") && raw.endsWith("`")) return decode(raw.slice(1, -1));
  if (types.includes("number") && /^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(raw) && Number.isFinite(Number(raw))) return Number(raw);
  if (!types.includes("string")) throw new Error(`${where}：应填写有限数值，不要带单位`);
  return decode(raw);
}
function table(headers: string[], rows: string[][]) { return `| ${headers.join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |\n${rows.map(row => `| ${row.join(" | ")} |`).join("\n")}\n\n`; }
function renderNode(data: any, schema: Schema, depth: number): string {
  if (schema.type === "object") {
    const props = Object.entries(schema.properties!);
    let out = table(["字段", "内容"], props.filter(([, s]) => scalar(s)).map(([key, s]) => [label(key), cell(data[key], s)]));
    for (const [key, s] of props.filter(([, s]) => !scalar(s))) out += `${"#".repeat(depth)} ${label(key)}\n\n${renderNode(data[key], s, depth + 1)}`;
    return out;
  }
  const items = data as any[];
  if (!items.length) return "无\n\n";
  const item = schema.items!;
  if (scalar(item)) return items.map(x => `- ${cell(x, item)}`).join("\n") + "\n\n";
  if (Object.values(item.properties!).every(scalar)) {
    const props = Object.entries(item.properties!);
    return table(props.map(([key]) => label(key)), items.map(row => props.map(([key, s]) => cell(row[key], s))));
  }
  return items.map((row, i) => `${"#".repeat(depth)} 条目 ${i + 1}\n\n${renderNode(row, item, depth + 1)}`).join("");
}
export function renderDocument(role: Role, data: any, notes = "") {
  const body = role === "builder" ? { summary: data.summary } : data;
  return `# ${role === "builder" ? "交付说明" : label(names[role])}\n\n${renderNode(body, schemaFor(role), 2)}## 说明\n\n${notes}\n`;
}
interface Section { title: string; lines: string[]; children: Section[] }
function sections(markdown: string): Section {
  const root: Section = { title: "文档", lines: [], children: [] }, stack = [{ depth: 0, node: root }];
  let firstHeading = true;
  for (const line of markdown.replace(/^\uFEFF/, "").replaceAll("\r\n", "\n").split("\n")) {
    // Standalone thematic breaks decorate the document; they are not field content.
    // Keep list items (e.g. "- ---"), indented code and every table cell untouched.
    if (/^ {0,3}(?:-{3,}|\*{3,}|_{3,})[ \t]*$/.test(line)) continue;
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) { stack.at(-1)!.node.lines.push(line); continue; }
    if (firstHeading && match[1].length === 1) { firstHeading = false; continue; }
    firstHeading = false;
    while (stack.length > 1 && stack.at(-1)!.depth >= match[1].length) stack.pop();
    const node: Section = { title: match[2], lines: [], children: [] };
    stack.at(-1)!.node.children.push(node); stack.push({ depth: match[1].length, node });
  }
  return root;
}
function rows(node: Section): string[][] {
  return node.lines.filter(line => line.trim().startsWith("|")).map(line => line.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map(x => x.trim()));
}
function keyFor(title: string, props: Record<string, Schema>) { return Object.keys(props).find(key => title === key || title === label(key)); }
function readNode(node: Section, schema: Schema, where: string): any {
  const lines = node.lines.map(x => x.trim()).filter(Boolean), tab = rows(node);
  if (tab.length && (tab.length < 2 || tab[1].length !== tab[0].length || tab[1].some(cell => !/^:?-{3,}:?$/.test(cell))))
    throw new Error(`${where}：Markdown 表格第二行必须为 --- 分隔行`);
  if (schema.type === "object") {
    const props = schema.properties!, out: Record<string, unknown> = {};
    if (tab.length < 2 || tab[0].length !== 2 || !/^(字段|field)$/i.test(tab[0][0]) || !/^(内容|value)$/i.test(tab[0][1])) throw new Error(`${where}：需要“字段 / 内容”Markdown 表格`);
    for (const row of tab.slice(2)) {
      const key = keyFor(row[0], props);
      if (row.length !== 2 || !key || !scalar(props[key])) throw new Error(`${where}：未知或错位字段“${row[0]}”`);
      if (key in out) throw new Error(`${where}：字段“${row[0]}”重复`);
      out[key] = value(row[1], props[key], `${where}/${row[0]}`);
    }
    for (const child of node.children) {
      if (child.title === "说明" && where === "文档") continue;
      const key = keyFor(child.title, props);
      if (!key || scalar(props[key]) || key in out) throw new Error(`${where}：未知或重复章节“${child.title}”`);
      out[key] = readNode(child, props[key], `${where}/${child.title}`);
    }
    for (const key of Object.keys(props)) if (!(key in out)) throw new Error(`${where}：缺少“${label(key)}”`);
    if (lines.some(line => !line.startsWith("|"))) throw new Error(`${where}：正文说明请放到文末“## 说明”，表格内换行使用 <br>`);
    return out;
  }
  if (lines.length === 1 && lines[0] === "无" && !node.children.length) return [];
  const item = schema.items!;
  if (scalar(item)) {
    const referenceList = /(?:^|\/)(?:fact_ids|事实编号列表|story_ids|段落编号列表|source_ids|来源编号列表)$/.test(where);
    if (referenceList && !node.children.length && lines.length === 1 && lines[0] === "- 无") return [];
    if (referenceList && lines.includes("- 无")) throw new Error(`${where}：“无”不能与真实编号混写；空列表单独写无，否则只填写真实编号`);
    if (node.children.length || !lines.length || lines.some(line => !line.startsWith("- "))) throw new Error(`${where}：填写 Markdown 列表，空列表写“无”`);
    return lines.map(line => value(line.slice(2), item, where));
  }
  if (Object.values(item.properties!).every(scalar)) {
    if (node.children.length || tab.length < 3 || lines.length !== tab.length) throw new Error(`${where}：填写数据表格，空表写“无”`);
    const keys = tab[0].map(title => keyFor(title, item.properties!));
    if (keys.some(key => !key) || new Set(keys).size !== Object.keys(item.properties!).length || keys.length !== Object.keys(item.properties!).length) throw new Error(`${where}：表格列名不完整或重复`);
    return tab.slice(2).map(row => {
      if (row.length !== keys.length) throw new Error(`${where}：表格列错位，内容中的竖线写作 \\|`);
      return Object.fromEntries(keys.map((key, i) => [key!, value(row[i], item.properties![key!], `${where}/${label(key!)}`)]));
    });
  }
  if (lines.length || !node.children.length || node.children.some(child => !/^条目\s+\d+$/.test(child.title))) throw new Error(`${where}：按“条目 1”“条目 2”分章节；空列表写“无”`);
  return node.children.map((child, i) => readNode(child, item, `${where}/条目 ${i + 1}`));
}
export function parseDocument(role: Role, markdown: string, options: { validateSchema?: boolean } = {}) {
  if (typeof markdown !== "string" || markdown.length > 2_000_000 || !markdown.trim()) throw new Error("Markdown 文档为空或超过 2MB");
  const split = /^## 说明[ \t]*$/m.exec(markdown);
  const body = split ? markdown.slice(0, split.index) : markdown;
  const notes = split ? markdown.slice(split.index + split[0].length).trim() : "";
  if (/^\s*```/m.test(body)) throw new Error("请直接提交 Markdown 文档，不要用 JSON 或代码围栏包裹");
  const tree = sections(body), data = readNode(tree, schemaFor(role), "文档");
  if (role !== "builder" && options.validateSchema !== false) validate(names[role], data);
  return { data, notes, markdown, protocol: DOCUMENT_PROTOCOL };
}
function sample(schema: Schema): any {
  if (schema.type === "object") return Object.fromEntries(Object.entries(schema.properties!).map(([key, s]) => [key, sample(s)]));
  if (schema.type === "array") return schema.items!.type === "object" ? [sample(schema.items!)] : ["填写实际内容，空列表写无"];
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.includes("null")) return null;
  if (types.includes("number")) return schema.minimum ?? 0;
  return schema.enum?.[0] || "填写实际内容";
}
export function documentTemplate(role: Role) { return renderDocument(role, sample(schemaFor(role)), "写明判断依据、转换过程与限制。模板中的占位内容必须替换；枚举值遵守角色指令。"); }
function constraints(schema: Schema, trail = "文档"): string[] {
  if (schema.type === "object") return Object.entries(schema.properties!).flatMap(([key, child]) => constraints(child, `${trail}/${label(key)}`));
  if (schema.type === "array") return constraints(schema.items!, `${trail}/条目`);
  return [
    ...(schema.enum ? [`- ${trail}：${schema.enum.join("、")}`] : []),
    ...(schema.minimum !== undefined || schema.maximum !== undefined ? [`- ${trail}：数值范围 ${schema.minimum ?? "不限"} 至 ${schema.maximum ?? "不限"}`] : []),
  ];
}
export function renderDataTable(rows: unknown[][]) {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  return table(["原始行", ...Array.from({ length: width }, (_, i) => `列 ${i + 1}`)], rows.map((row, i) => [String(i + 1), ...Array.from({ length: width }, (_, j) => cell(row[j] ?? "", { type: "string" }))]));
}
export function documentInstructions(role: Role) {
  return `使用 Markdown 文档作为正式交接，调用 submit_stage 的 markdown 字符串参数提交，不提交 JSON 业务对象。章节和字段使用下列模板的中文名（或对应英文名），可调整表格行与章节顺序，不得省略字段。重复条目复制章节并连续编号；数值序列和证据等简单记录使用表格；没有内容的列表写“无”。表格内容中的竖线写 \\|，换行写 <br>；空字符串留空，缺失链接/日期/父组件写“未提供”；数值不带单位，数值文本要保留类型时加反引号。不要用代码围栏包裹文档。${role === "builder" ? "先调用 save_html 保存独立 HTML，再提交本交付说明。" : ""}\n\n${documentTemplate(role)}${role === "analyst" ? "\nAnalyst 可先保存 Markdown 草稿，预检问题是待修反馈，不是正式提交失败；按事实条目局部修正，最后以 draft_revision 提交已保存的同一份 Markdown，无需重复发送全文。correlation 表达关联：相关系数单位 r、ρ、τ 的值在 -1 至 1；来源报告的 OR、RR、HR 为非负比值，可以大于 1，保留原单位、方法、参照组及调整口径，不能把比值改为相关系数。calculate 目前仅支持 Pearson r 的确定性计算，不计算 OR/RR/HR；引用文献结果使用 quoted，仍须逐字证据。" : ""}\n枚举和数值约定：\n${constraints(schemaFor(role)).join("\n")}`;
}
