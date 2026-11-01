# 系统架构与协议

React → Express → Orchestrator → ChatBot → Researcher → Analyst → Designer → Builder。
Orchestrator 仅选择阶段、校验依赖、执行、提交、持久化与恢复；专业内容由独立 Pi 会话完成。

每个项目在 workspace/projects/<UUID>，原始文件 input/、标准化资料 research/、素材 assets/、交付 output/、历史 state/versions/、Pi 会话 state/sessions/。正式产物由完成阶段的工具提交，模型没有任意文件写入或 shell 权限。读取工具只能访问本项目或只读的已发现 Skill。以模型提交的 Markdown 为正式交接文档；程序按统一章节、字段表、列表及数值表解析内部索引，保留原始文档与说明。JSON 仅用于程序内部索引、状态，模型不维护两套产物。Builder 通过受控 save_html 暂存 HTML，再与 Markdown 交付报告一起提交。

Schema 位于 schemas/；共享类型位于 packages/shared/。事实的 evidence/source_ids/relations 和设计的 fact_ids/mapping 都要做引用完整性检查。禁止将相关性直接声明为因果；因果关系需要明确依据。

每阶段输入指纹包含 Brief、原始文件摘要、上游正式产物和角色配置；加入 Markdown 协议版本，产物摘要覆盖文档与内部索引。所有阶段使用同一 Markdown 指纹与恢复规则。恢复时验证已完成阶段文件和指纹，首次失效阶段及后续阶段重新执行。阶段提交先写不可变版本，最后原子切换 checkpoint；task-state.json 是恢复视图。正在运行时单项目排他；可跨项目执行。暂停通过 AbortSignal 中止 Pi，并保留上次完整阶段。重启将 running 标记 interrupted。自动重试仅限网络/限流临时错误，默认最多三次，可由 `.env` 调整。

运行配置全部保存于项目 `.env`。配置元数据、范围校验、密钥脱敏与串行原子写入由 config-store 管理。设置页复用 Art 的四模块表单；端口与工作目录重启生效，其他设置保存后用于后续任务。Pi ModelRuntime 使用内存凭据与项目提供商注册，不依赖全局认证或 models.json。每角色有独立 provider/model/baseURL/key/thinkingLevel；连接设置摘要参与阶段失效判断。Designer 原生加载 technical / artistic 与按角色配置的额外 Skill，read 工具只允许已发现知识文件。图像服务通过 Pi 公开 ProviderImages 接口复用 Art 的 OpenAI-compatible 请求协议。

Researcher 工具导入 CSV/Excel/PDF/Word，或搜索及抓取公开 HTTPS 数据；来源保留 URL、采集日期、发布日期（未知为空），原始响应保留 research/。网络请求过滤私有地址及重定向。文件名称由服务端生成，不使用用户路径。

Builder 提交独立 HTML，禁用外部脚本和远程资源，使用内联 SVG/CSS/JS，素材可由图片工具生成后内嵌。作品预览在 sandbox iframe 中；PDF 使用 Chromium print，相同 HTML、等待字体与图像完成，禁用动画，适配设计页面。PDF 导出错误保留 HTML，不假装成功。

API 仅本机同源使用，检查 Origin 和 Host，限制上传大小与类型，不提供远程多用户鉴权。若要公开部署，需先加入用户认证、授权、配额与租户隔离。

## 项目生命周期

创建项目接口支持空 Brief，立即建立磁盘草稿并返回详情；只有发送有效需求后才启动 Pi。`DREAMATIC_WORKSPACE` 是项目目录集合的根目录，默认 `workspace/projects`。显示名称独立存放 `project-display.json`，读取项目时覆盖 AI 标题；与任务 checkpoint 分离，允许运行中改名且不改变输入指纹。项目写接口由现有项目锁串行处理；运行中删除被调度器和存储层拒绝。删除使用同文件系统目录 rename 移到根目录 `.trash`，不清除内容；UUID 列表扫描自动忽略回收目录。前端移除删除项并停止对应轮询/事件订阅，避免重复创建与旧请求回填。

## Markdown 交接协议

见 docs/MARKDOWN_PROTOCOL.md。submit_stage 接受 markdown 字符串；Analyst 与 Designer 也可使用已保存的 draft_revision。内容必须遵守当前角色的中文文档模板。模板来自现有业务 Schema，但模型提示不再注入 JSON Schema 或完整上游 JSON。read_handoff 按允许的文件名读取完整文档与 brief.md。原始上传文件、证据引文及来源追溯继续保留。

提交依次解析 Markdown、校验业务结构、引用和真实证据。正式提交、Analyst 草稿工具参数错误、草稿连续无进展分别计数，默认相同错误/停滞状态达到 3 次或连续失败/无进展达到 5 次停止。草稿预检待修问题正常返回，不能占用正式提交预算；实际问题减少、通过事实增加或结构恢复可解析时重置窗口。删除事实、回退已通过条目或更换错误引文不算进展；阶段总时限和网络重试预算仍独立生效。Pi 执行前拒绝的参数进入对应工具预算。技术提交错误不能转为用户需求提问。界面展示工具失败原因及文档校验结果。

文档提交失败预算可在 Settings → 系统参数高级选项调整，统一保存于 `.env`：`DREAMATIC_MAX_REPEATED_SUBMISSIONS` 和 `DREAMATIC_MAX_INVALID_SUBMISSIONS`，用于后续阶段会话。

正式文档只提供 Markdown 下载。JSON 索引仅保存在内部 artifact.json 中，不再生成项目根目录的报告 JSON 副本。编辑接口仅接受 `{markdown}`；阶段提交必须带原始 Markdown，缺失协议或原文的产物直接拒绝，不提供转换回退。配置只读取当前 `.env` 键，不迁移旧 JSON 或环境变量别名。

## 调研中间成果

ResearchWorkbench 管理模型保存的 Markdown 计划、关键词队列、候选和采集记录。调研范围按需求/上传资料/intent/正文门槛计算，状态在 research/runs/<scope>/progress.json 串行原子保存，计划原文版本为 plan-N.md。网络工具先检查计划，再按 task_id 执行；缓存成功结果跨会话复用，失败显式重试并受独立请求预算约束。正文检查拒绝验证/登录/订阅限制、空页、过短内容和错误数据响应；被拒绝内容保留诊断，不能作为正式来源。证据校验只接受当前范围已登记且内容摘要一致的可用正文。项目详情提供 research_progress，来源页在正式报告前展示计划、候选、正文和失败原因。详见 RESEARCH_WORKBENCH.md。

## 网页阅读器

公开 HTTP 传输拆为 public-http.ts，使用 tough-cookie 在单次读取内保持正常会话并逐跳检查/固定公共 IP；识别无进展循环。document-reader.ts 使用禁用脚本/远程资源的 JSDOM、Mozilla Readability 和 Turndown GFM 生成保留结构的 Markdown。web-reader.ts 提供普通网页 auto/http/browser 模式，按需使用原生 Chromium 网络栈；browser-egress.ts 使用验证并固定公共 IP 的 CONNECT 隧道，覆盖实际重定向和子资源。scholarly-reader.ts 对 PMC/PubMed 使用官方 BioC 全文/摘要接口，核对文章编号并保留资料范围与局限。并发、请求数、字节和总时限可在设置中调整，阅读器/跳转链/诊断与原始、渲染存档可追溯。详见 WEB_READER.md。

阶段卡片的“第 N 次启动”为累计执行启动次数，包含恢复、重新执行和自动重试，不代表来源请求次数；具体采集次数在调研工作台单独显示。手动暂停标记“用户暂停任务”，服务 SIGINT/SIGTERM 标记服务停止中断；后续启动清除旧阶段错误，已有成果继续保留。临时网络/限流的自动重试在执行事件中明确标示。

## Analyst 草稿与证据工作台

AnalystWorkbench 基于当前需求、intent、Research 与实际来源内容摘要隔离草稿；evidence-view 生成有来源/摘要/片段定位的只读视图。Analyst 按真实来源编号引用同一证据块，Schema、来源与引文问题以 Markdown 清单汇总。save_analysis_draft / patch_analysis_fact 保存不可变 Markdown 版本，完成整版写入后切换指针；read_analysis_draft 在新会话恢复已保存条目。Analyst 可用 draft_revision 最终提交同一 Markdown，正式 Orchestrator 提交及五角色分工保持原约定。预检不提前产生正式成果，待修问题正常返回；草稿参数错误、草稿无进展与正式提交分别计数，有效进展重置窗口。详见 ANALYST_WORKBENCH.md。

项目详情以只读 analysis_progress 投影当前范围的事实草稿和校验状态，数据事实 Tab 在正式提交前展示草稿卡片、统计和问题清单，沿用现有轮询/SSE。下载接口按当前版本提供纯文本 Markdown。读取使用 readOnly 模式，不重写证据文件；范围变化隐藏旧事实，正式提交后只展示正式成果，下游仍只读取正式产物。

## 事实类型与计算凭据

数据事实采用十类基础类型及独立 derivation，必填 specification 统计口径。source-calculation 从当前来源证据块解析实际表格，fact-statistics 提供确定性运算；计算凭据保存在项目 state/calculations，提交时基于当前来源重新计算并核对结果、序列与单位。独立复算不接受模型自填输入数据，辅助 values 计算不作为正式凭据。Designer 对核心 value 与 series 分别校验单位。当前 Schema 自动使旧 Analyst/下游在续跑检查时失效，不迁移猜测旧事实。详见 DATA_FACT_TYPES.md。

## 叙事设计中间成果

DesignerWorkbench 按需求、正式事实、Research、设计 Schema 及实际来源摘要隔离 Markdown 草稿。原生读取/保存/段落修正/排序工具返回当前版本与校验清单，设计进展复用草稿无进展保护。项目详情与 design/progress 只读投影接通原有轮询/SSE；逻辑与叙事 Tab 联动展示故事顺序、选材理由、事实与证据、来自 Analyst 的关系和显式 story_ids 组件映射。完成正式提交后才向 Builder 暴露设计，详见 [DESIGNER_WORKBENCH.md](DESIGNER_WORKBENCH.md)。


## D3 可视化

工作台事实卡片使用 D3 7.9.0 的比例尺、折线和环形布局计算几何，由 React 渲染 SVG。Designer/Builder 通过原生 read_visualization_guide 获取数据、单位、可访问性与 D3 API 契约。Builder save_html 与正式持久化共用本地官方运行库内嵌逻辑；下载 HTML、隔离预览和 PDF 使用同一自包含产物，不添加 CDN 或网络权限。Builder 指纹包含库版本与摘要；保留五个角色与 Markdown 交接。详见 [D3 接入记录](D3_VISUALIZATION.md)。
