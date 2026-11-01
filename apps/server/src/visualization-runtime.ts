import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { load } from "cheerio";
import { validateHtml } from "./validation.js";
let cached: Promise<{ version: string; code: string; digest: string }> | undefined;
function runtime() {
  return cached ??= (async () => {
    const entry = import.meta.resolve("d3");
    const [source, license, metadata] = await Promise.all([readFile(new URL("../dist/d3.min.js", entry), "utf8"), readFile(new URL("../LICENSE", entry), "utf8"), readFile(new URL("../package.json", entry), "utf8")]);
    const version = JSON.parse(metadata).version as string;
    const code = (`/* D3.js ${version} — ISC License\n${license.replaceAll("*/", "* /")}\n*/\n${source}`).replace(/<\/script/gi, "<\\/script");
    return { version, code, digest: createHash("sha256").update(code).digest("hex") };
  })();
}
export async function visualizationRuntimeInfo() { const { version, digest } = await runtime(); return { toolkit: "d3", version, digest }; }
/** Package the installed official runtime before authored scripts, never a CDN. */
export async function embedVisualizationRuntime(html: string) {
  validateHtml(html);
  const library = await runtime(), $ = load(html);
  $("script[data-dreamatic-runtime='d3']").remove();
  const script = $("<script></script>").attr("data-dreamatic-runtime", "d3").attr("data-d3-version", library.version).text(library.code);
  $("head").prepend(script);
  const charset = $("head meta[charset]").first();
  if (charset.length) charset.attr("charset", "utf-8").prependTo("head");
  else $("head").prepend('<meta charset="utf-8">');
  const packaged = $.html(); validateHtml(packaged);
  return packaged;
}
export async function visualizationGuide() {
  const { version } = await runtime();
  return `# D3 可视化指南\n\n系统提供 d3@${version}。save_html 会把官方运行库及 ISC 许可内嵌到 HTML，在作者脚本之前执行；直接使用全局 d3，不添加 CDN、import、远程字体或远程数据请求。下载 HTML 与 PDF 使用同一自包含作品。\n\n## 数据契约\n\n从正式 datafacts.md 读取数值、series、单位和证据；按照 design.md 的组件编号、事实编号、图表类型、mapping 和色板编码。保留 data-component-id 与 data-fact-id。D3 在这里负责比例尺、形状、坐标轴和交互，不能替代 Analyst 重算或编造事实。\n\n## 对应 API\n\n- 条形图：d3.scaleBand（按索引而非标签建 domain，避免同名观测合并）、d3.scaleLinear，数值域包含 0，负值从零线向反方向展开。\n- 折线图：d3.scaleUtc / scaleTime 与 d3.line().curve(d3.curveLinear)，使用真实时间间隔，不伪造中间值，不用平滑曲线暗示未观察到的峰值。\n- 环图：d3.pie().sort(null) 与 d3.arc，数据须非负、构成同一整体且总和为正；零值和百分比 0/100 也应正常处理。\n- 坐标轴：d3.axisBottom / axisLeft；显示单位和可读刻度，提示或明细保留完整原始数值。\n- 排名：保留 Analyst 提供的顺序、并列口径及关注对象；长标签可使用水平条形。\n- 交互：d3.select、selectAll、data、join，使用 text() 输出来源文字，不把不可信文本作为 html()；支持键盘/焦点及减少动态偏好。\n\n## 结构类型\n\n时间线以 structure.events 的真实日期构建 d3.scaleUtc；流程/层级的连线只来自 structure.edges，保留边的标签与方向，不推断因果；散点用 structure.observations 的成对 x/y，分别显示变量名称和单位，d3.scaleLinear 映射。所有结构组件只关联一个同类型事实，mapping.label_field/value_field 均为 structure，mapping.unit 留空。完整结构和逐条证据需有可访问明细。地图、网络、桑基不支持。\n\n## 制作要求\n\n在内联脚本中使用 d3；给图表 title/desc 和数据明细，响应式用 viewBox 与 CSS。数据直接内嵌，禁止 d3.csv/json/fetch 读取外部地址。混合单位不能共用一条数值轴或环图；没有成对数据不生成相关散点图。优先使用 SVG，导出前移除依赖动画结束才出现内容的设计。\n\n正式保存和提交继续受原有组件/事实引用及资源校验约束。已有作品不由本工具自动重写。\n`;
}
