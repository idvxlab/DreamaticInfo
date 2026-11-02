import { readProjectEnvironment } from "./environment.js";
import path from "node:path";
import {
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import { readFile, writeFile, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type {
  ConfigField,
  RuntimeConfig,
} from "../../../packages/shared/config.js";
const field = (
  key: string,
  label: string,
  module: string,
  type: ConfigField["type"],
  defaultValue: string,
  example: string,
  description = "",
  extra: Partial<ConfigField> = {},
): ConfigField => ({
  key,
  label,
  module,
  type,
  defaultValue,
  example,
  description,
  ...extra,
});
export const CONFIG_MODULES = [
  {
    id: "search",
    title: "搜索引擎",
    description: "配置公开资料搜索服务与 API 密钥。",
  },
  {
    id: "reasoning",
    title: "推理模型",
    description: "配置默认连接，以及五个专业智能体的独立模型与推理强度。",
  },
  {
    id: "image",
    title: "图像模型",
    description: "配置 Builder 使用的图像生成连接、模型和输出尺寸。",
  },
  {
    id: "system",
    title: "系统参数",
    description: "管理工作目录、服务端口、文件限制、任务超时与重试。",
  },
];
const thinking = ["", "off", "minimal", "low", "medium", "high", "xhigh"];
export const CONFIG_FIELDS: ConfigField[] = [
  field(
    "DREAMATIC_SKILL_PATHS",
    "按角色配置 Skill 路径（JSON）",
    "system",
    "text",
    "",
    '{"designer":["/absolute/path/to/skill"]}',
    "可选的额外知识来源；每个路径应为 Skill 目录或 SKILL.md，不授予工具执行权限。",
    { advanced: true },
  ),
  field(
    "DREAMATIC_SEARCH_PROVIDER",
    "搜索服务",
    "search",
    "select",
    "auto",
    "auto",
    "自动模式优先使用已配置的 Brave，否则使用 Bing，再尝试 DuckDuckGo。",
    { options: ["auto", "bing", "duckduckgo", "brave", "serper"] },
  ),
  field(
    "DREAMATIC_SEARCH_API_KEY",
    "搜索 API 密钥",
    "search",
    "secret",
    "",
    "your-search-api-key",
    "Brave 或 Serper 使用；留空保留当前密钥。",
  ),
  field(
    "DREAMATIC_SEARCH_RESULTS",
    "搜索结果数量",
    "search",
    "number",
    "8",
    "8",
    "每次搜索返回的最大条目数。",
    { min: 1, max: 20, advanced: true },
  ),
  field("DREAMATIC_ACQUISITION_CONCURRENCY", "数据源查询并发", "search", "number", "3", "3", "官方数据源采集设置；受共享任务预算约束。", { min: 1, max: 6, advanced: true }),
  field("DREAMATIC_ACQUISITION_TIMEOUT_MS", "单次数据源操作时限（毫秒）", "search", "number", "30000", "30000", "官方数据源采集设置；受共享任务预算约束。", { min: 1000, max: 120000, advanced: true }),
  field("DREAMATIC_ACQUISITION_MAX_ROWS", "数据切片行数上限", "search", "number", "2000", "2000", "官方数据源采集设置；受共享任务预算约束。", { min: 10, max: 10000, advanced: true }),
  field("DREAMATIC_KAGGLE_TOKEN", "Kaggle API Token", "search", "secret", "", "", "官方数据源采集设置；受共享任务预算约束。", { advanced: true }),
  field("DREAMATIC_NCBI_API_KEY", "NCBI API Key", "search", "secret", "", "", "官方数据源采集设置；受共享任务预算约束。", { advanced: true }),
  field("DREAMATIC_WEB_READER", "网页阅读方式", "search", "select", "auto", "auto", "普通网页自动模式先 HTTP、必要时用原生 Chromium；PMC/PubMed 使用官方接口，不使用个人浏览器登录态。", { options: ["auto", "http", "browser"], advanced: true }),
  field("DREAMATIC_WEB_READER_TIMEOUT_MS", "网页阅读总时限（毫秒）", "search", "number", "90000", "90000", "覆盖 HTTP、浏览器等待与正文提取前的总预算。", { min: 5000, max: 300000, advanced: true }),
  field("DREAMATIC_WEB_MAX_REDIRECTS", "网页跳转上限", "search", "number", "12", "12", "带 Cookie 跟随跳转，同时识别不推进会话的循环。", { min: 1, max: 30, advanced: true }),
  field("DREAMATIC_WEB_HTTP_TIMEOUT_MS", "静态网页请求时限（毫秒）", "search", "number", "15000", "15000", "自动模式下限制静态 HTTP 尝试，为浏览器回退保留时间；仍受网页总时限约束。", { min: 1000, max: 60000, advanced: true }),
  field("DREAMATIC_WEB_BROWSER_READY_TIMEOUT_MS", "动态正文追加等待上限（毫秒）", "search", "number", "15000", "15000", "初始等待后继续观察正文，内容稳定可用即结束；仍受网页总时限约束。", { min: 0, max: 60000, advanced: true }),
  field("DREAMATIC_WEB_SCHOLARLY_TIMEOUT_MS", "学术开放接口时限（毫秒）", "search", "number", "15000", "15000", "PMC 全文及 PubMed 摘要使用官方 BioC 接口，不抓取受限制的论文页面。", { min: 1000, max: 60000, advanced: true }),
  field("DREAMATIC_WEB_BROWSER_WAIT_MS", "动态正文等待（毫秒）", "search", "number", "2000", "2000", "页面 DOM 加载后等待脚本生成内容，仍受总时限约束。", { min: 0, max: 15000, advanced: true }),
  field("DREAMATIC_WEB_BROWSER_MAX_REQUESTS", "单页浏览器请求上限", "search", "number", "60", "60", "限制动态页面资源数量，图像、字体、媒体不加载。", { min: 5, max: 200, advanced: true }),
  field("DREAMATIC_WEB_BROWSER_MAX_BYTES", "单页浏览器总字节上限", "search", "number", "20000000", "20000000", "限制所有页面及脚本响应的累计字节数；单响应仍受采集上限约束。", { min: 1000000, max: 100000000, advanced: true }),
  field("DREAMATIC_WEB_BROWSER_CONCURRENCY", "网页浏览器并发上限", "search", "number", "2", "2", "限制并行渲染的独立页面数量，排队也计入总时限。", { min: 1, max: 4, advanced: true }),
  field("DREAMATIC_SOURCE_MIN_TEXT_CHARS", "来源正文最少字符数", "search", "number", "180", "180", "短于此长度的网页正文标记为不可用；验证码与访问限制页始终拒绝。", { min: 30, max: 3000, advanced: true }),
  field("DREAMATIC_RESEARCH_MAX_TASKS", "搜索队列条目上限", "search", "number", "40", "40", "限制单份搜索计划的关键词数量。", { min: 1, max: 100, advanced: true }),
  field("DREAMATIC_RESEARCH_REQUEST_ATTEMPTS", "单关键词或链接最多请求次数", "search", "number", "3", "3", "搜索按连接配置累计，链接按当前调研范围累计；成功结果优先复用，失败须显式重试。", { min: 1, max: 10, advanced: true }),
  field(
    "DREAMATIC_NETWORK_TIMEOUT_MS",
    "网络请求超时（毫秒）",
    "search",
    "number",
    "25000",
    "25000",
    "适用于搜索及公开来源采集。",
    { min: 1000, max: 300000, advanced: true },
  ),
  field(
    "DREAMATIC_PROVIDER_TYPE",
    "提供商协议",
    "reasoning",
    "select",
    "native",
    "openai-compatible",
    "Pi 原生使用内置提供商；兼容协议允许配置自己的 API 地址。",
    { options: ["native", "openai-compatible", "openai-responses"] },
  ),
  field(
    "DREAMATIC_SUPPORTS_DEVELOPER_ROLE",
    "兼容接口支持 developer 角色",
    "reasoning",
    "select",
    "false",
    "false",
    "仅影响自定义 OpenAI-compatible / Responses 连接。默认使用 system 传递角色指令；只有确认接口支持 developer 时才启用。推理能力与消息角色分别配置。",
    { options: ["false", "true"], advanced: true },
  ),
  field(
    "DREAMATIC_PROVIDER",
    "默认提供商",
    "reasoning",
    "text",
    "openai",
    "openai",
    "Pi 原生提供商 ID，例如 openai、anthropic。兼容协议使用下方 API 地址。",
  ),
  field(
    "DREAMATIC_BASE_URL",
    "推理 API 地址",
    "reasoning",
    "url",
    "https://api.openai.com/v1",
    "https://api.example.com/v1",
    "使用兼容协议时填写 API 基础地址；原生模式使用 Pi 官方适配。",
  ),
  field(
    "DREAMATIC_API_KEY",
    "推理 API 密钥",
    "reasoning",
    "secret",
    "",
    "your-text-api-key",
    "仅保存于当前项目 .env；留空保留当前密钥。",
  ),
  field(
    "DREAMATIC_MODEL",
    "默认推理模型",
    "reasoning",
    "text",
    "gpt-5.4",
    "gpt-5.4",
    "填写提供商提供的完整模型 ID。",
  ),
  field(
    "DREAMATIC_PROVIDER_NAME",
    "连接名称",
    "reasoning",
    "text",
    "",
    "Dreamatic Studio",
    "可选的连接说明，不用于选择模型。",
    { advanced: true },
  ),
  field(
    "DREAMATIC_THINKING_LEVEL",
    "默认推理强度",
    "reasoning",
    "select",
    "medium",
    "medium",
    "仅对支持推理的模型生效，实际能力由 Pi 适配器决定。",
    { options: thinking.slice(1), advanced: true },
  ),
  field(
    "DREAMATIC_CONTEXT_WINDOW",
    "自定义模型上下文窗口",
    "reasoning",
    "number",
    "128000",
    "128000",
    "模型不在 Pi 目录中时使用。请按实际提供商能力填写。",
    { min: 1024, max: 10000000, advanced: true },
  ),
  field(
    "DREAMATIC_MAX_TOKENS",
    "自定义模型输出上限",
    "reasoning",
    "number",
    "8192",
    "8192",
    "模型不在 Pi 目录中时使用，不得大于上下文窗口。",
    { min: 1, max: 1000000, advanced: true },
  ),
  field(
    "DREAMATIC_MODEL_REASONING",
    "自定义模型支持推理",
    "reasoning",
    "select",
    "false",
    "false",
    "仅用于 Pi 目录以外的模型；按提供商真实能力设置。",
    { options: ["false", "true"], advanced: true },
  ),
  ...["chatbot", "researcher", "analyst", "designer", "builder"].flatMap(
    (role) => {
      const name =
          role === "chatbot"
            ? "ChatBot"
            : role[0].toUpperCase() + role.slice(1),
        suffix = role.toUpperCase();
      return [
        field(
          `DREAMATIC_MODEL_${suffix}`,
          `${name} 模型`,
          "reasoning",
          "text",
          "",
          "your-model-id",
          "留空使用默认推理模型。",
          { advanced: true },
        ),
        field(
          `DREAMATIC_PROVIDER_${suffix}`,
          `${name} 提供商`,
          "reasoning",
          "text",
          "",
          "anthropic",
          "留空使用默认连接；填写 Pi 原生提供商 ID 可独立选择提供商。",
          { advanced: true },
        ),
        field(
          `DREAMATIC_BASE_URL_${suffix}`,
          `${name} API 地址`,
          "reasoning",
          "url",
          "",
          "https://api.example.com/v1",
          "可选的独立兼容接口，使用默认提供商协议。",
          { advanced: true },
        ),
        field(
          `DREAMATIC_API_KEY_${suffix}`,
          `${name} API 密钥`,
          "reasoning",
          "secret",
          "",
          "your-role-api-key",
          "留空继承默认连接密钥；已配置时留空保留。",
          { advanced: true },
        ),
        field(
          `DREAMATIC_THINKING_LEVEL_${suffix}`,
          `${name} 推理强度`,
          "reasoning",
          "select",
          "",
          "medium",
          "留空使用默认推理强度。",
          { options: thinking, advanced: true },
        ),
      ];
    },
  ),
  field(
    "DREAMATIC_IMAGE_BASE_URL",
    "图像 API 地址",
    "image",
    "url",
    "https://api.openai.com/v1",
    "https://api.example.com/v1",
    "使用与 Art 相同的 OpenAI-compatible 图像生成协议。",
  ),
  field(
    "DREAMATIC_IMAGE_API_KEY",
    "图像 API 密钥",
    "image",
    "secret",
    "",
    "your-image-api-key",
    "未单独配置时使用默认推理密钥；留空保留。",
  ),
  field(
    "DREAMATIC_IMAGE_MODEL",
    "图像模型",
    "image",
    "text",
    "gpt-image-1",
    "gpt-image-1",
    "填写兼容 OpenAI Images 协议的模型 ID。",
  ),
  field(
    "DREAMATIC_IMAGE_DEFAULT_SIZE",
    "图像生成尺寸",
    "image",
    "text",
    "1024x1024",
    "1536x1024",
    "WIDTHxHEIGHT；需要由实际模型与接口支持。",
  ),
  field(
    "DREAMATIC_IMAGE_GENERATION_ENDPOINT",
    "图像生成端点",
    "image",
    "url",
    "",
    "https://api.example.com/v1/images/generations",
    "留空使用图像 API 地址下的 /images/generations。",
    { advanced: true },
  ),
  field(
    "DREAMATIC_IMAGE_RESPONSE_FORMAT",
    "图像响应格式",
    "image",
    "select",
    "auto",
    "auto",
    "auto 省略 response_format；按实际接口支持选择。",
    { options: ["auto", "b64_json", "url"], advanced: true },
  ),
  field(
    "DREAMATIC_IMAGE_RESPONSE_MAX_BYTES",
    "图像响应字节上限",
    "image",
    "number",
    "67108864",
    "67108864",
    "含 Base64 JSON 开销与下载图片。",
    { min: 1024, max: 268435456, advanced: true },
  ),
  field(
    "DREAMATIC_IMAGE_TIMEOUT_MS",
    "图像生成超时（毫秒）",
    "image",
    "number",
    "300000",
    "300000",
    "每次图像请求的总时限。",
    { min: 1000, max: 3600000, advanced: true },
  ),
  field(
    "PORT",
    "API 服务端口",
    "system",
    "number",
    "4315",
    "4315",
    "更改后重启 API 和前端开发服务。",
    { min: 1024, max: 65535, restartRequired: true },
  ),
  field(
    "DREAMATIC_WEB_PORT",
    "前端开发端口",
    "system",
    "number",
    "5175",
    "5175",
    "仅开发模式使用，更改后重启。",
    { min: 1024, max: 65535, restartRequired: true },
  ),
  field(
    "DREAMATIC_WORKSPACE",
    "项目工作目录",
    "system",
    "text",
    "./workspace/projects",
    "./workspace/projects",
    "相对路径从项目根目录解析；更改不会迁移已有项目。",
    { restartRequired: true },
  ),
  field(
    "DREAMATIC_CHROME_PATH",
    "Chromium 浏览器路径",
    "system",
    "text",
    "",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "留空自动寻找 Chrome、Edge 或 Playwright Chromium；填写后严格使用该路径，无效时提示错误。相对路径从项目根目录解析。",
  ),
  field("DREAMATIC_MODEL_RUN_LIMIT", "单次运行模型调用上限", "system", "number", "120", "120", "每次明确运行或继续建立新计数；自动重试仍共用本次额度。任务累计上限独立约束。", { min: 1, max: 10000, advanced: true }),
  field("DREAMATIC_MODEL_TASK_LIMIT", "任务累计模型调用上限", "system", "number", "120", "120", "同一需求跨运行累计，继续不会清零；可在任务界面明确追加额度，不改变费用与返修限制。", { min: 1, max: 10000, advanced: true }),
  field("DREAMATIC_MAX_REPORTED_COST_USD", "已报告模型费用上限（USD）", "system", "number", "5", "5", "仅约束 SDK 可报告的估算费用；图像服务或自定义价格缺失时不能代表账单上限。恢复时不自动清零。", { min: 0.01, max: 1000, advanced: true }),
  field(
    "DREAMATIC_UPLOAD_LIMIT_MB",
    "单文件上传上限（MB）",
    "system",
    "number",
    "25",
    "25",
    "下一次上传立即使用新限制；提取后的文本仍有独立的 8MB 上限。",
    { min: 1, max: 200, advanced: true },
  ),
  field(
    "DREAMATIC_MAX_FETCH_BYTES",
    "来源采集字节上限",
    "system",
    "number",
    "5000000",
    "5000000",
    "每个公开来源响应的最大字节数。",
    { min: 1024, max: 100000000, advanced: true },
  ),
  field("DREAMATIC_MODEL_CALL_TIMEOUT_MS", "单次模型调用时限（毫秒）", "system", "number", "180000", "180000", "持续流式输出也受此时限约束；工具执行单独计时，已保存成果保留。", { min: 10000, max: 900000, advanced: true }),
  field("DREAMATIC_ANALYST_PROGRESS_TIMEOUT_MS", "分析无持久化进展时限（毫秒）", "system", "number", "240000", "240000", "Analyst 未保存新计算凭据或事实草稿时停止等待；重复读取、相同计算和相同草稿不刷新时限。", { min: 10000, max: 900000, advanced: true }),
  field("DREAMATIC_MODEL_IDLE_TIMEOUT_MS", "模型无响应时限（毫秒）", "system", "number", "90000", "90000", "模型持续没有返回文本、推理或工具调用时停止等待；工具执行使用各自时限，已保存成果保留。", { min: 10000, max: 600000, advanced: true }),
  field(
    "DREAMATIC_RUN_TIMEOUT_MINUTES",
    "单次运行总预算（分钟）",
    "system", "number", "45", "45",
    "所有阶段及重试共用的墙钟上限；暂停后继续建立新运行预算，历史等待仍保留。",
    { min: 1, max: 720, advanced: true },
  ),
  field(
    "DREAMATIC_STAGE_TIMEOUT_MINUTES",
    "单阶段超时（分钟）",
    "system",
    "number",
    "15",
    "15",
    "含模型与工具执行的阶段总时限。",
    { min: 1, max: 240, advanced: true },
  ),
  field(
    "DREAMATIC_RETRY_ATTEMPTS",
    "任务最大尝试次数",
    "system",
    "number",
    "3",
    "3",
    "包括首次执行；仅对可恢复的网络或限流错误重试。",
    { min: 1, max: 10, advanced: true },
  ),
  field(
    "DREAMATIC_MAX_REPEATED_SUBMISSIONS",
    "相同提交错误或修复停滞上限",
    "system",
    "number",
    "3",
    "3",
    "正式提交与草稿参数错误分别计数；草稿重复同一无进展状态也受此限制，有效修复会重置连续失败窗口。",
    { min: 1, max: 20, advanced: true },
  ),
  field(
    "DREAMATIC_MAX_INVALID_SUBMISSIONS",
    "连续提交失败或修复无进展上限",
    "system",
    "number",
    "5",
    "5",
    "正式提交失败、草稿参数错误与草稿无进展分别计数；有效修复会重置窗口，草稿待修问题不占正式提交预算。阶段时限仍独立生效。",
    { min: 1, max: 30, advanced: true },
  ),
  field(
    "DREAMATIC_PDF_TIMEOUT_MS",
    "PDF 导出超时（毫秒）",
    "system",
    "number",
    "30000",
    "30000",
    "覆盖浏览器启动、渲染和打印的总时限。",
    { min: 1000, max: 300000, advanced: true },
  ),
];
export const CONFIG_ROOT = path.resolve(process.env.INFO_CONFIG_DIR || ".");
export const ENV_PATH = path.join(CONFIG_ROOT, ".env");
const schema = new Map(CONFIG_FIELDS.map((f) => [f.key, f]));
function encode(v: string) {
  if (!/[\s#'"`\\]/.test(v)) return v;
  if (!v.includes("'")) return `'${v}'`;
  if (!v.includes('"')) return `"${v}"`;
  throw new Error("配置值不能同时包含单引号和双引号");
}
function validate(f: ConfigField, v: unknown) {
  if (typeof v !== "string" || /[\r\n\0]/.test(v))
    throw new Error(`${f.label}：请输入单行文本`);
  v = v.trim();
  const value = v as string;
  if (f.options && !f.options.includes(value))
    throw new Error(`${f.label}：不支持的选项`);
  if (
    f.type === "number" &&
    (!/^\d+$/.test(value) ||
      !Number.isSafeInteger(Number(value)) ||
      Number(value) < f.min! ||
      Number(value) > f.max!)
  )
    throw new Error(`${f.label}：请输入 ${f.min}–${f.max} 之间的整数`);
  if (f.type === "url" && value) {
    let u: URL;
    try {
      u = new URL(value);
    } catch {
      throw new Error(`${f.label}：请输入完整 HTTP(S) 地址`);
    }
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
      throw new Error(`${f.label}：不允许嵌入凭据或使用非 HTTP(S) 地址`);
  }
  if (
    f.key === "DREAMATIC_IMAGE_DEFAULT_SIZE" &&
    !/^[1-9]\d{1,4}x[1-9]\d{1,4}$/.test(value)
  )
    throw new Error("图像尺寸应为 WIDTHxHEIGHT");
  if (f.key === "DREAMATIC_SKILL_PATHS" && value) {
    let parsed: any;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error("Skill 路径必须为 JSON 对象");
    }
    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      Object.entries(parsed).some(
        ([role, paths]) =>
          !["chatbot", "researcher", "analyst", "designer", "builder"].includes(
            role,
          ) ||
          !Array.isArray(paths) ||
          paths.some((p) => typeof p !== "string" || !path.isAbsolute(p)),
      )
    )
      throw new Error("Skill 路径必须按角色提供绝对路径数组");
  }
  return value;
}
function validateSnapshot(values: Record<string, string>) {
  for (const f of CONFIG_FIELDS) validate(f, values[f.key]);
  if (
    Number(values.DREAMATIC_MAX_TOKENS) >
    Number(values.DREAMATIC_CONTEXT_WINDOW)
  )
    throw new Error("模型输出上限不能大于上下文窗口");
  if (values.PORT === values.DREAMATIC_WEB_PORT)
    throw new Error("API 与前端开发端口不能相同");
}
function source(root: string) {
  const f = path.join(root, ".env");
  return existsSync(f) ? readFileSync(f, "utf8") : "";
}
function snapshot(root: string, env: NodeJS.ProcessEnv) {
  const values = readProjectEnvironment(root, env);
  return Object.fromEntries(
    CONFIG_FIELDS.map((f) => [f.key, values[f.key] ?? f.defaultValue]),
  );
}
function updateText(text: string, values: Record<string, string>) {
  const written = new Set<string>(),
    lines: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const key = line.match(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/,
    )?.[1];
    if (!key || !(key in values)) lines.push(line);
    else if (!written.has(key)) {
      lines.push(`${key}=${encode(values[key])}`);
      written.add(key);
    }
  }
  for (const [key, value] of Object.entries(values))
    if (!written.has(key)) lines.push(`${key}=${encode(value)}`);
  return lines.join("\n").replace(/^\n+|\n+$/g, "") + "\n";
}
// The project .env is the sole persisted runtime configuration.
export function initializeConfig(
  root = CONFIG_ROOT,
  env: NodeJS.ProcessEnv = process.env,
) {
  const text = source(root),
    values = snapshot(root, env);
  validateSnapshot(values);
  const next = updateText(text, values);
  if (next !== text) {
    mkdirSync(root, { recursive: true });
    const temp = path.join(root, `.env.${randomUUID()}.tmp`);
    writeFileSync(temp, next, { mode: 0o600 });
    renameSync(temp, path.join(root, ".env"));
  }
  for (const [k, v] of Object.entries(values)) env[k] = v;
}
export function setting(key: string, env: NodeJS.ProcessEnv = process.env) {
  return env[key] ?? schema.get(key)?.defaultValue ?? "";
}
export function readRuntimeConfig(
  root = CONFIG_ROOT,
  env: NodeJS.ProcessEnv = process.env,
  restartRequired: string[] = [],
): RuntimeConfig {
  const values = snapshot(root, env);
  return {
    envPath: path.join(root, ".env"),
    pendingApply: CONFIG_FIELDS.some(
      (f) => values[f.key] !== setting(f.key, env),
    ),
    modules: CONFIG_MODULES,
    fields: CONFIG_FIELDS.map((f) => ({ ...f })),
    values: Object.fromEntries(
      CONFIG_FIELDS.filter((f) => f.type !== "secret").map((f) => [
        f.key,
        values[f.key],
      ]),
    ),
    secretConfigured: Object.fromEntries(
      CONFIG_FIELDS.filter((f) => f.type === "secret").map((f) => [
        f.key,
        !!values[f.key],
      ]),
    ),
    restartRequired: restartRequired.length
      ? restartRequired
      : CONFIG_FIELDS.filter(
          (f) => f.restartRequired && values[f.key] !== setting(f.key, env),
        ).map((f) => f.key),
  };
}
const queues = new Map<string, Promise<unknown>>();
export async function saveRuntimeConfig(
  input: unknown,
  root = CONFIG_ROOT,
  env: NodeJS.ProcessEnv = process.env,
) {
  const previous = queues.get(root) ?? Promise.resolve();
  const task = previous
    .catch(() => {})
    .then(async () => {
      if (!input || typeof input !== "object" || Array.isArray(input))
        throw new Error("配置必须为对象");
      const payload = input as Record<string, unknown>;
      if (Object.keys(payload).some((k) => !["values", "secrets"].includes(k)))
        throw new Error("不支持的配置字段");
      const next = snapshot(root, env);
      for (const group of ["values", "secrets"]) {
        const v = payload[group];
        if (v === undefined) continue;
        if (!v || typeof v !== "object" || Array.isArray(v))
          throw new Error(`${group} 必须为对象`);
        for (const [key, value] of Object.entries(v)) {
          const f = schema.get(key);
          if (!f || (f.type === "secret") !== (group === "secrets"))
            throw new Error("不支持的配置项");
          const checked = validate(f, value);
          if (group !== "secrets" || checked) next[key] = checked;
        }
      }
      validateSnapshot(next);
      const restart = CONFIG_FIELDS.filter(
        (f) => f.restartRequired && setting(f.key, env) !== next[f.key],
      ).map((f) => f.key);
      const tmp = path.join(root, `.env.${randomUUID()}.tmp`);
      try {
        await writeFile(
          tmp,
          updateText(
            await readFile(path.join(root, ".env"), "utf8").catch((e) => {
              if (e.code === "ENOENT") return "";
              throw e;
            }),
            next,
          ),
          { mode: 0o600 },
        );
        await rename(tmp, path.join(root, ".env"));
        for (const [k, v] of Object.entries(next))
          if (!schema.get(k)?.restartRequired) env[k] = v;
        return readRuntimeConfig(root, env, restart);
      } finally {
        await rm(tmp, { force: true });
      }
    });
  queues.set(root, task);
  try {
    return await task;
  } finally {
    if (queues.get(root) === task) queues.delete(root);
  }
}
initializeConfig();

export function approvedSkillPaths(role: string): string[] {
  const value = setting("DREAMATIC_SKILL_PATHS");
  return value ? JSON.parse(value)[role] || [] : [];
}
