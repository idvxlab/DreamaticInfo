# 技术调研与实施计划

核实日期：2026-10-30。当前 DreamaticInfo 为空目录，没有既有运行或部署配置。

## Pi Harness

通过 npm 官方注册表 `npm view @earendil-works/pi-coding-agent version repository.url --json` 确认最新稳定版为 **1.4.0**，仓库为 https://github.com/earendil-works/pi 。统一锁定 Pi 三个包为 1.4.0，安装后复核发布包声明与源码。官方 SDK：https://pi.dev/docs/latest/sdk 。

采用公开 `createAgentSession`、`ModelRuntime`、`SessionManager`、`DefaultResourceLoader` 与 `ToolDefinition`。不复制运行时。每个角色有独立会话、独立模型配置，确定性调度在业务层。Pi 原生 Skill 发现、描述注入和按需读取负责专业知识加载。以安装版本实际声明为准，避免旧版示例中的 tools 数组类型等接口差异。

## 相邻项目调研

已读取两个根目录 AGENTS.md、package.json、前端源码目录和样式，以及 Web 的 FactCard、QuestionCard 和 Pi Skill 集成。

- DreamaticWeb：React 19 / TypeScript / Vite 7，Express 5 后端，Pi 1.3.0；前端组件按功能拆分，FactCard 使用序号、来源、证据展开、关联媒体，QuestionCard 支持选项和自定义回答。生产构建是静态 Vite 输出加 Node API。
- Dreamatic：React / TypeScript，独立 web/server 工作区，保留 Pi 供历史会话读取。三栏产品工作台，侧栏管理项目、中间画布、右侧交互面板；桌面壳不适合本次直接移植。
- 共通设计：`#20211d` 深色侧栏、`#e8e7e1` 暖灰背景、`#f6f5f0` 面板、`#d76942` 橙色、`#c9e46b` 青柠色；Segoe UI / PingFang / system-ui；小字号层级、细边框、圆角、Lucide 图标、轻量状态动画。
- 复用策略：保留上述原始设计 token、布局和卡片/问答交互模式；领域数据模型不同，改写领域组件以避免绑定旧项目接口。使用 Lucide 与 CSS/SVG 图表，初始产品无需复制大型图像。两个相邻项目只读，不读取凭据与运行数据。

## 分阶段可运行交付

1. 定义 JSON Schema、文件协议和状态接口。
2. Pi 集成、项目隔离、原始文件导入、五角色工具与执行调度。
3. 原子状态、阶段指纹、重试、中断、恢复与上游变更失效。
4. React 工作台：项目/对话/事实/来源/设计/作品/模型设置。
5. 上传与网络工具、HTML/PDF、自动化测试、浏览器验证和文档。

运行方式：`npm install`、`npm run dev`；Web 5175 / API 4315，均绑定 127.0.0.1。生产 `npm run build && npm start`。部署目标是具有持久磁盘的 Node 主机；不适合静态或 Worker 托管。模型凭据由用户的 Pi 环境配置提供；无凭据也可启动，显式演示模式仅使用内置标注样例，不能代替真实模型验收。
