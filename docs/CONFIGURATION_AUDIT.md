# Settings / .env 配置接通检查

检查日期：2026-10-30。范围为 Settings 的 58 个字段：搜索 4、推理 36、图像 8、系统 10。逐项核对字段定义、`.env.example`、保存与加载、实际消费者和生效时机；未调用用户外部模型或图像服务。

## 配置流与生效规则

Settings 使用 `config-store.ts` 的统一字段定义。启动时优先读取项目根目录 `.env`，缺失项再取进程环境和默认值；显式空值保留其含义。首次启动补齐当前配置字段。Vite 开发端口与 API 代理使用相同的环境读取函数，不使用 `.env.local` 或模式文件覆盖端口配置。

保存接口校验完整配置，再串行原子写入 `.env`；保留注释和无关字段，密钥留空保留原值，读取接口只返回是否已配置密钥。活动任务或导出期间拒绝保存配置。保存后重建 Pi Runtime，非重启项用于后续任务。手动编辑 `.env` 后须重启，或在 Settings 保存以应用磁盘值。

`PORT`、`DREAMATIC_WEB_PORT`、`DREAMATIC_WORKSPACE` 必须重启对应服务；工作目录切换不会迁移已有项目。开发端口仅用于 Vite，生产静态页面由 API 端口提供。

## 字段与实际消费者

表内省略通用前缀 `DREAMATIC_`，只有 `PORT` 不带此前缀。

| 模块 | 配置字段 | 实际消费者与行为 |
| --- | --- | --- |
| 搜索 | `SEARCH_PROVIDER`、`SEARCH_API_KEY` | `network.ts / searchWeb` 选择 Brave、Serper、Bing 或 DuckDuckGo；auto 有密钥时使用 Brave，否则 Bing 失败后尝试 DuckDuckGo。Serper 须显式选择。 |
| 搜索 | `SEARCH_RESULTS` | 各通道按配置限制返回条数；Brave 也在响应后截断，避免服务忽略 count。 |
| 搜索 | `NETWORK_TIMEOUT_MS` | 搜索请求和公开 HTTPS 抓取的超时；与上层阶段中止信号共同生效。 |
| 推理 | `PROVIDER_TYPE`、`PROVIDER`、`BASE_URL`、`API_KEY`、`MODEL` | `packages/shared/model-settings.ts / resolveModels` 与 `pi.ts / runtime` 注册 Pi 模型、选择协议、地址与认证。原生模式使用 Pi 提供商适配，默认 BASE_URL 仅供自定义连接使用。 |
| 推理 | `SUPPORTS_DEVELOPER_ROLE` | 自定义连接的 Pi `compat.supportsDeveloperRole`；默认 false，兼容旧接口的 system 消息角色。 |
| 推理 | `PROVIDER_NAME` | 注册的自定义连接显示名称，不参与模型 ID 选择。 |
| 推理 | `THINKING_LEVEL` | 五角色默认推理强度，进入 Pi 会话；实际支持范围由模型和适配器决定。 |
| 推理 | `CONTEXT_WINDOW`、`MAX_TOKENS`、`MODEL_REASONING` | Pi 目录之外的自定义模型能力描述；目录内已知模型沿用其原生元数据。因此这些字段对已知模型不覆盖原生能力。 |
| 推理 | `PROVIDER_<ROLE>`、`MODEL_<ROLE>`、`BASE_URL_<ROLE>`、`API_KEY_<ROLE>`、`THINKING_LEVEL_<ROLE>` | 每个角色各 5 项，共 25 项；ROLE 为 CHATBOT、RESEARCHER、ANALYST、DESIGNER、BUILDER。空值继承默认，独立地址形成自定义连接；显式切换不同原生提供商时须有该提供商的认证，避免误用默认密钥。 |
| 图像 | `IMAGE_BASE_URL`、`IMAGE_API_KEY`、`IMAGE_MODEL` | `pi.ts` 注册公开 Pi 图像提供商，Builder 的生成工具使用；独立图像密钥为空时继承默认推理密钥。 |
| 图像 | `IMAGE_DEFAULT_SIZE`、`IMAGE_GENERATION_ENDPOINT`、`IMAGE_RESPONSE_FORMAT` | `image-provider.ts` 组装生成请求；端点留空使用基础地址下默认生成路径，格式为 auto 时不发送此字段。端点、格式、尺寸也参与图像缓存键。 |
| 图像 | `IMAGE_RESPONSE_MAX_BYTES`、`IMAGE_TIMEOUT_MS` | 限制生成响应大小与时限；URL 图片下载使用同一图像字节上限，另受公开网络策略和网络超时约束。 |
| 系统 | `SKILL_PATHS` | `approvedSkillPaths` 与 Pi 原生资源加载器按角色加载额外 Skill；路径进入阶段输入指纹，修改后在继续执行时重算受影响阶段及下游。只读发现的 Skill，不增加 shell 权限。 |
| 系统 | `PORT`、`WEB_PORT` | `index.ts` API 监听、`vite.config.ts` 开发端口与代理、同源端口检查；重启生效。 |
| 系统 | `WORKSPACE` | `store.ts / ROOT`，所有项目数据与回收目录的根目录；重启生效，相对路径从项目根目录解析。 |
| 系统 | `CHROME_PATH` | `export.ts / browserOptions`；填写时严格使用该路径，不存在即报错；留空才自动发现浏览器。相对路径从项目根目录解析。 |
| 系统 | `UPLOAD_LIMIT_MB` | `policy.ts` → API Multer 与 `ingest.ts`；每次上传读取配置，限制与报错文字一致。提取后的文本另有独立 8MB 上限。 |
| 系统 | `MAX_FETCH_BYTES` | `policy.ts` → `publicGet`；公开来源响应字节上限，报错显示当前配置值。 |
| 系统 | `STAGE_TIMEOUT_MINUTES`、`RETRY_ATTEMPTS` | `policy.ts` → Orchestrator；每次阶段尝试的时限和临时网络/限流错误最大尝试次数，不对永久错误反复重试。 |
| 系统 | `PDF_TIMEOUT_MS` | `export.ts / exportPdf`；浏览器启动、渲染和打印共享总预算，移除原先隐藏的页面 20 秒上限。 |

模型连接、搜索和图像设置进入相关角色的输入指纹。修改配置不会自动运行项目；下次继续/执行时才检查已有阶段是否失效。Skill 路径指纹不检测同路径下文件正文的编辑；直接改 Skill 内容后应手动重新执行对应阶段。

## 修复与验证

本次修复：Skill 路径未参与阶段失效判断、图像缓存遗漏生成端点、PDF 隐藏超时和错误浏览器路径静默回退、Brave 返回条数未截断、限制报错硬编码，以及 Vite 与后端端口读取优先级不一致。

新增 `tests/configuration-wiring.test.ts` 共 12 项，覆盖字段与示例完整一致、环境优先级、五角色独立连接/认证/能力参数、Skill 指纹、搜索服务/密钥/条数、上传上限、图像请求/缓存/响应上限、PDF 路径/时限与重试预算。测试在独立临时目录运行，使用注入传输或本地确定性提供商，不读取用户密钥、不调用外部模型。

本次完整自动化结果：`npm run check`、42 项测试、`npm run build` 全部通过。包含真实 Pi SDK 对接本地服务、Chromium PDF 生成与回读。外部提供商认证是否有效、远程服务协议兼容性及实际生成质量仍需真实环境验收；配置读取/参数接通通过不等于外部服务可用。

本机运行验证：启动开发服务后，API 健康检查、Settings 和 Vite API 代理均返回 200；Settings 返回全部 58 项字段，密钥值未进入返回的 values，`pendingApply=false`、`restartRequired=[]`。此检查只读取本机接口，未提交项目或调用外部生成服务。

## Markdown 协议新增配置

Markdown 改造新增系统高级字段 `DREAMATIC_MAX_REPEATED_SUBMISSIONS`（默认 3）与 `DREAMATIC_MAX_INVALID_SUBMISSIONS`（默认 5），由 submission-policy.ts 在每阶段会话开始时读取。Settings / .env.example 字段总数现为 60；上文 58 项及其运行验证记录保留为当时的验收结果。

## 调研工作台新增配置

新增 DREAMATIC_SOURCE_MIN_TEXT_CHARS（180）、DREAMATIC_RESEARCH_MAX_TASKS（40）、DREAMATIC_RESEARCH_REQUEST_ATTEMPTS（3），分别由正文提取、计划解析和请求预算读取。Settings/.env.example 总字段现为 63，已通过全字段一致性及相关行为测试。

## 网页阅读器配置

新增 7 个 DREAMATIC_WEB_* 字段，分别控制读取方式、总时限、跳转、动态等待、请求数、总字节和并发；由 public-http.ts / web-reader.ts 直接使用。初次接入时 Settings/.env.example 共 70 项，具体默认值和验证见 WEB_READER.md。

2026-10-31：新增静态请求、动态正文追加等待及官方学术接口三个独立时限，目前 Settings/.env.example/.env 共 73 项。普通网页原生 Chromium 通过 DNS 固定的 CONNECT 出口，学术站点走官方接口；失败缓存使用新策略版本，未改变用户已有时限。详见 WEB_READER.md。
