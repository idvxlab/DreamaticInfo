# Dreamatic · Info

基于 Pi Harness 1.4.0 的本地智能信息设计工作台。五个独立角色通过 Markdown 文档交接 Brief、资料、Data Facts 和设计方案，生成自包含 HTML 与 PDF 海报。界面复用 Dreamatic · Web / Art 的设计 token 与工作台交互模式。

## 启动

需要 Node.js ≥22.19，建议 Node 24+；本项目已在 Node 25.6.1 验证。

```sh
npm install
npm run dev
```

打开 http://127.0.0.1:5175 ，API 为 http://127.0.0.1:4315 。首页与侧栏的「新建项目」都会创建空白草稿；发送需求后才调用模型。

真实项目可直接打开「模型与设置」配置，所有运行配置统一保存于项目根目录 `.env`；首次启动自动创建完整默认配置。也可参考 `.env.example` 手动编辑后重启。设置页与 Dreamatic · Art 使用相同的四模块弹窗、双列表单、分段标签和高级选项：

- **搜索引擎**：auto / Bing / DuckDuckGo / Brave / Serper、独立密钥、结果数量和网络超时。
- **推理模型**：Pi 原生提供商或 OpenAI-compatible / Responses、自定义 API 地址与密钥、默认模型；高级选项分别覆盖五个角色的提供商、模型、API 地址、密钥和推理强度。
- **图像模型**：使用与 Art 相同的 OpenAI-compatible 请求字段，通过 Pi 的公开图像提供商接口接入；配置地址、模型、独立密钥、尺寸、端点、响应格式和限制。
- **系统参数**：API／开发端口、工作目录、PDF 浏览器、上传与采集限制、阶段超时、重试、额外 Skill 路径。

密钥输入留空保留当前值；设置接口仅返回是否已配置，不返回密钥。保存时校验并原子写入 `.env`，保留注释和其他已有键。模型、搜索、图像和运行限制用于后续任务；端口、开发端口和工作目录标注为重启生效。启动只读取当前 `.env` 配置，不读写全局 Pi 认证文件。切换原生提供商时，请为不同提供商分别配置对应角色密钥。

推理模型面板会显示每个角色实际使用的连接与模型，并标记“继承默认”或“独立覆盖”。如果更改默认连接后角色仍使用旧模型，可点击对应角色的“使用默认”并保存；独立密钥会保留。

默认 `openai/gpt-5.4` 不代表已配置认证。兼容接口的模型不在 Pi 目录中时，需要按实际能力配置上下文窗口、输出上限和推理支持。

上传 CSV、TSV、XLSX、PDF、DOCX、TXT、Markdown 或 JSON，单文件默认 25MB。旧二进制 `.xls` / `.doc` 需先另存为现代格式；扫描 PDF 需先 OCR。没有上传数据时，Researcher 可调用网络搜索与来源采集，根据设置选择服务；auto 优先使用已配置的 Brave，否则使用 Bing RSS，再尝试 DuckDuckGo。网络不可达或来源缺失时显示错误，不生成虚构数据。公开 PDF / Office 文件暂需先下载后上传。

PDF 导出使用本机 Chrome / Edge / Chromium，或 Playwright Chromium。可设置 `DREAMATIC_CHROME_PATH`；没有浏览器时执行 `npx playwright install chromium`。相同 HTML 在禁用外部请求的 Chromium 中渲染，等待字体与内嵌图像，关闭动画后打印。导出超时会返回错误，HTML 始终保留。

## 使用流程

1. 在对话区描述主题、目标受众、范围和偏好，可同时上传文件。
2. ChatBot 形成 Brief；确有必要才以选项卡提问。
3. Researcher 先保存搜索计划与关键词队列，再实际读取/抓取资料；Analyst 提取事实与关联；Designer 生成叙事、图表映射和布局协议；Builder 提交 HTML。
4. 浏览「数据事实」「叙事与设计」「数据来源」及「信息图作品」，下载 HTML 或导出 PDF。
5. 可暂停/继续，在阶段旁重新执行该阶段及下游。补充需求或上传新数据会使受影响成果失效。

## 结构

- `apps/web`：React / Vite 工作台。
- `apps/server/src`：API、文件导入、公开网络工具、Pi 运行适配、调度器、持久化、引用校验、PDF。
- `packages/shared`：类型与五角色定义。
- `agents`：独立角色 Markdown，无重复角色提示词嵌入业务代码。
- `skills/technical` 与 `skills/artistic`：Pi 原生 Skill。包含信息设计与 Picasso / Van Gogh / Monet 艺术方法，按需读取，不注入全部正文。
- `schemas`：五类核心 JSON Schema。
- `.env`：统一运行配置；`.env.example`：无密钥的完整配置参考；`apps/server/src/config-store.ts`：字段、校验和原子保存。
- `workspace/projects/<UUID>`：原始文件、标准化资料、双格式产物、不可变版本、任务状态、Pi 会话与输出，已忽略，不提交用户资料。

## 项目管理

未新建或选中项目时，对话输入、建议、文件上传和发送均禁用，并提示先新建或选择项目；发送消息不会自动创建项目。

点击「新建项目」立即创建并保存草稿，在侧栏列表中显示「未命名项目 · 草稿」，无需等待输入需求或模型执行。第一条消息在该项目内启动任务，不再创建重复项目。

项目行的 `…` 菜单支持改名和删除，沿用 Art 的行内改名交互。名称为 1–120 个字符；显示名称单独保存在 `project-display.json`，不会被智能体标题覆盖，也不会触发工作流重新生成。运行中可以改名；删除前须暂停任务。

删除经确认后将整个项目目录移入项目工作目录下的 `.trash/`，从列表移除；删除当前项目后切换到其他项目，若无项目则回到初始页面。原始资料、状态、会话和输出都保留，可停止任务后将 `.trash/<回收目录>` 移回原来的 `<项目 ID>` 目录恢复，避免覆盖同名目录。

项目默认存放在 `workspace/projects/<项目 ID>`。可在「设置 → 系统参数 → 项目工作目录」修改 `DREAMATIC_WORKSPACE`，保存于 `.env`，重启后使用新目录。相对路径从项目根目录解析；支持绝对路径。已有资料不会自动移动，切换新目录只显示该目录中的项目；改回原目录即可重新显示旧项目。

## 调研进展

“数据来源”页面在调研完成前即可查看 Markdown 搜索计划、关键词队列、候选链接、正文摘录和失败原因。Researcher 按计划任务编号执行，暂停或重试会复用成功搜索和可用正文；普通网页通过 Cookie、Readability 和按需原生 Chromium 读取，PMC/PubMed 使用官方开放全文/摘要接口并明确区分范围，保留 Markdown 表格与链接；验证码等限制页保留诊断，不作为有效证据。计划和进展保存在项目 research/runs/ 下，原始响应与可读正文保存在 research/ 下。搜索高级设置可调整正文长度门槛、关键词数量和请求次数。详见 `docs/RESEARCH_WORKBENCH.md`。

## Markdown 交接

模型通过 `submit_stage({markdown})` 提交文档，不再编写嵌套业务 JSON。中文章节、字段表、列表、证据和数值表由程序解析，继续校验来源、事实和图表映射；正式文档原样存入不可变版本。下游先读取 `brief.md` 和相关交接文档，提示词只携带目录和短摘要。Builder 单独暂存 HTML，再提交 Markdown 交付说明。

正式提交与草稿参数错误分别计数；Analyst 草稿预检待修问题正常返回。有效修复重置连续失败窗口，默认同一错误/停滞状态 3 次或连续失败/无进展 5 次才停止；阶段总超时仍独立生效。正式产物统一使用当前 Markdown 协议。内部索引和任务状态仍使用 JSON，由程序维护。详见 `docs/MARKDOWN_PROTOCOL.md`。

## 恢复与修改

每阶段先生成不可变版本，再原子更新项目 checkpoint，最后物化正式 Markdown 与 HTML。恢复校验输入指纹、产物摘要、Schema 与引用，从第一个失效阶段继续；旧版本保留。启动时自动将遗留 running 状态标记 interrupted。任务状态同时记录阶段、尝试次数、输入输出文件、最近成功时间和错误。

正式产物的人工修改可通过 `PUT /api/projects/:id/artifact/:role` 提交 `{markdown}`（遵守对应角色的 Markdown 模板；适用于 chatbot/researcher/analyst/designer），完整校验、记录版本，并使下游失效。直接改正式文件会被恢复检查判为失效并重跑对应阶段，故建议使用此接口。项目级写操作排他，模型运行时禁止修改资料和配置。

## 验证

```sh
npm run check
npm test
npm run build
# 在服务启动后：
npm run test:smoke
```

测试涵盖 Pi 真实 SDK 对接本地确定性提供商、五阶段产物、跳过有效阶段、暂停恢复、进程恢复、输入/模型/产物变化失效、Schema/引用/引文校验、路径与私网访问隔离、XLSX/DOCX/PDF 导入及 Chromium PDF 输出。API smoke 仅验证草稿创建、改名、回收与接口边界，不调用外部模型、不创建示例。HTML/PDF 完整链路由隔离的本地测试执行器验证。

**验收边界：** 测试通过不代表真实 LLM 质量已验收；真实提供商的端到端生成、艺术 Skill 的实际模型遵循度和 AI 图像生成仍需单独验收。HTML 自动检查组件/事实标记和依赖完整性，不能证明所有视觉映射都正确，真实作品还需数据与视觉核对。详见 `docs/VALIDATION.md`。

## 生产运行

```sh
npm run build
npm start
```

访问 http://127.0.0.1:4315 。当前为本机单用户产品；仅绑定 loopback，检查 Host/Origin。跨用户鉴权、配额和多租户授权尚未实现。需要持久磁盘的 Node 服务，不能直接部署为静态站点。`DREAMATIC_WORKSPACE` 可在 `.env` 中指定独立资料目录，启动 API 时工作目录应为项目根目录。

详细文档：

- `docs/PROJECT_SPEC.md`：原始总指令。
- `docs/RESEARCH_AND_PLAN.md`：Pi 与两个参考项目的调研、实施顺序。
- `docs/ARCHITECTURE.md`：数据协议、执行边界与恢复设计。
- `docs/VALIDATION.md`：验收结果与尚待真实环境验证的项目。
- `docs/CONFIGURATION_AUDIT.md`：设置字段的后端消费者、生效规则、修复与测试记录。
- `docs/CONVERSATION_DESIGN.md`：Art 对话设计调查、实施方案及验收范围。
- `docs/MARKDOWN_PROTOCOL.md`：Markdown 正式交接、模板规则、内部索引与版本恢复。
- `docs/RESEARCH_WORKBENCH.md`：搜索计划、关键词队列、正文检查、跨重试复用与中间成果。
- `docs/WEB_READER.md`：开源网页阅读器选择、Cookie/动态渲染和实际网址验收。

### 兼容接口拒绝 developer 角色

若服务返回 `developer is not one of ...`，说明消息角色与该接口不兼容。自定义连接默认设置 `DREAMATIC_SUPPORTS_DEVELOPER_ROLE=false`，通过 Pi 的 `compat.supportsDeveloperRole` 使用 `system` 传递指令，保持模型推理能力独立。仅在接口明确支持时，在推理模型高级选项中开启此项。Pi 原生提供商不受此自定义连接参数影响。

文档提交失败预算可在 Settings → 系统参数高级选项调整，统一保存于 `.env`：`DREAMATIC_MAX_REPEATED_SUBMISSIONS` 和 `DREAMATIC_MAX_INVALID_SUBMISSIONS`，用于后续阶段会话。

Analyst 支持来源证据视图、Markdown 草稿预检、单事实追加/修正和中断恢复；最终仍完整校验并提交，避免局部错误导致整篇重写。详见 [Analyst 工作台](docs/ANALYST_WORKBENCH.md)。

“数据事实”Tab 在 Analyst 保存草稿后即可展示逐条事实、已通过/待修正数量、证据与修正要求，暂停后仍保留。草稿明确标注未正式提交，正式完成后切换为正式成果；来源变化时不展示旧验证结果。

数据事实支持数值、对比、趋势、分布、相关、占比、分类、排名、极值和异常；引用/独立计算/推断/预测单独标记。来源计算会保存可复算凭据并校验结果与统计口径，详见 [十类事实](docs/DATA_FACT_TYPES.md)。

逻辑与叙事 Tab 展示 Designer 分批保存的 Markdown 草稿、选材与顺序理由，并联动段落、事实、原始证据与视觉组件；正式提交后才进入 Builder。工具、存储及验证见 [叙事工作台](docs/DESIGNER_WORKBENCH.md)。
