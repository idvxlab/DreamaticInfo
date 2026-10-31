# 网页读取与正文提取

更新：2026-10-31。

## 本次诊断与实施计划

已按项目进展记录核对失败页面：PMC 多数是 HTTP 403；Lancet、Wiley 返回安全验证页；MDPI 没有提供文章正文。原实现把 Forbidden 等错误页统一归为正文过短，且所谓浏览器渲染仍由 Node HTTPS 代取所有响应并注入 Chromium，因此没有完整使用 Chromium 的 TLS、Cookie、跳转与数据请求行为。固定等待两秒也可能早于动态正文完成。

实施顺序：先核对原始响应与官方读取接口；再替换浏览器网络传输、增加分阶段预算与正文就绪等待；最后完善错误分类、来源范围与展示，执行确定性回归和实际网址验收。没有降低正文长度门槛来接受错误页。

## 当前读取策略

1. PMC 与 PubMed 按站点规则使用官方 NCBI BioC 接口。PMC 使用开放全文接口；PubMed 使用题录/摘要接口，明确标记“未取得全文”。PMC 官方要求自动读取使用指定服务，因此不再回退抓取 PMC 网页。
2. BioC 必须返回一个匹配编号的 document、有标题和内容；PMC 还需包含正文段落，不能只有摘要。PMC 的文档编号合法形式包含 `PMC10061888` 和 `10061888`；会同时核对可用的 article-id_pmc。接口帮助/错误页、错误编号、只有摘要的 PMC 响应均拒绝。
3. 普通网页 auto 模式先用带单次匿名 Cookie jar 的 HTTP 传输；逐跳验证公共地址、固定实际连接 IP。URL 与 Cookie 不变才判无进展循环；静态请求有独立时限，为浏览器回退保留时间。
4. 静态 HTML 不足或失败时启动独立 Chromium，由 Chromium 自己执行 TLS、Cookie、重定向和 JavaScript。使用临时本机 CONNECT 出口，每条实际连接都验证全部 DNS 地址并固定公共 IP；不代取或改写网页响应。显式关闭隐式 loopback 绕过和 QUIC；私网重定向/子资源同样被阻断。
5. 每次浏览器读取使用新上下文，保留匿名站点 Cookie，禁用 Service Worker、WebSocket、弹窗、下载和图片/字体/媒体。允许页面、脚本、样式、XHR/fetch 的 GET/HEAD，以及不超过 64 KiB 的数据 POST（包括公开跨域数据接口及其正常 OPTIONS 预检）；不允许表单导航 POST 和其他方法。无个人浏览器配置、登录态或站点凭据。
6. DOM 加载后先等待配置的初始时长，再观察提取正文是否可用且连续稳定；受追加等待上限与总预算约束。页面暂时导航导致快照失败时有限重试；持续导航明确报告，已有验证页快照可供诊断。不会永远等待 analytics 连接结束。
7. Chromium 出口累计限制双向传输字节；CDP Network.dataReceived 监测解码后的单资源及累计字节，越限即关闭浏览器。限制并发、请求数、导航次数与最终 DOM 大小；总取消信号覆盖排队、网络和浏览器，取消后关闭晚完成的浏览器及隧道。
8. JSDOM（禁用脚本和远程资源）与 Mozilla Readability 提取正文，非文章页使用 main/article/body；Turndown + GFM 输出 Markdown，保留表格、标题和绝对链接。HTTP 错误页、Forbidden、Cookie 提示、验证/登录/付费限制和过短内容分别说明原因，不作为正文证据。

官方接口不存在记录不等于浏览器不能打开，也不证明论文不存在；只说明当前接口未返回可用资料。BioC 为文本段落，表格版式、图片及补充材料可能不完整，来源记录和 Markdown 保留这项局限及许可信息。

## 开源技术选择

沿用 TypeScript 体系中的 Playwright、Mozilla Readability 0.6.0（Apache-2.0）、JSDOM 27.4.0（MIT）、Turndown 7.2.4/GFM 1.0.2（MIT）、tough-cookie 6.0.2（BSD）。本次没有复制浏览器或 Pi 内部实现，也没有升级 Pi。

Crawlee 提供完整队列和浏览器池，但本项目已有调研队列、缓存、限额和持久化；Crawl4AI 增加 Python 服务链路。当前优先修正传输和站点读取路径，未引入第二套爬虫调度。这些框架也不能保证通过安全验证或取得非开放全文。

参考：

- [NCBI 官方程序读取说明及 BioC](https://pmc.ncbi.nlm.nih.gov/tools/developers/)
- [Playwright 网络和代理](https://playwright.dev/docs/network)
- [Mozilla Readability](https://github.com/mozilla/readability)
- [Turndown](https://github.com/mixmark-io/turndown)
- [Crawlee](https://github.com/apify/crawlee)
- [Crawl4AI](https://github.com/unclecode/crawl4ai)

## 来源存档与展示

`research/web-UUID.raw.txt` 保留原始响应（BioC 为 XML）；浏览器 DOM 或 API 派生 HTML 保存在 `research/web-UUID.rendered.txt`；可读资料是 `research/web-UUID.md`。Markdown 保留实际读取 URL、范围、局限和读取方式；队列记录保留用户请求 URL、链路、诊断和次数。界面分别显示官方接口、原生 Chromium 和 HTTP；摘要单独标记，不称为全文。

阅读策略版本已更新，历史失败记录不清除；后续采集可按新配置重新尝试，保留总次数。成功且内容摘要一致的资料继续复用。未主动重跑用户项目或调用外部模型。

## Settings 与 .env

全部在 Settings → 搜索引擎 → 高级选项，保存到 `.env`；系统当前共 73 项配置。

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| DREAMATIC_WEB_READER | auto | 普通网页 auto / http / browser；学术站点使用官方接口 |
| DREAMATIC_WEB_READER_TIMEOUT_MS | 90000 | 单页总预算，含排队和各读取阶段 |
| DREAMATIC_WEB_HTTP_TIMEOUT_MS | 15000 | 静态请求阶段预算 |
| DREAMATIC_WEB_SCHOLARLY_TIMEOUT_MS | 15000 | 官方学术接口预算 |
| DREAMATIC_WEB_MAX_REDIRECTS | 12 | HTTP 跳转 / 浏览器主页面导航上限 |
| DREAMATIC_WEB_BROWSER_WAIT_MS | 2000 | DOM 加载后的初始等待 |
| DREAMATIC_WEB_BROWSER_READY_TIMEOUT_MS | 15000 | 追加正文就绪等待上限，可提前结束 |
| DREAMATIC_WEB_BROWSER_MAX_REQUESTS | 60 | 单页请求数上限 |
| DREAMATIC_WEB_BROWSER_MAX_BYTES | 20000000 | 浏览器累计传输及解码字节各自上限 |
| DREAMATIC_WEB_BROWSER_CONCURRENCY | 2 | 同进程并行浏览器读取数 |

单响应/最终 DOM 仍受 DREAMATIC_MAX_FETCH_BYTES 约束；底层连接仍受 DREAMATIC_NETWORK_TIMEOUT_MS 约束。浏览器路径与 PDF 共用 DREAMATIC_CHROME_PATH。此次三个新增时限均已写入当前 `.env`，未改用户已有配置值。

## 验证与已知限制

76 项回归测试通过，覆盖真实 Pi Session + 本地确定性模型服务、五阶段、PDF，以及读取/调研相关 19 项：官方接口身份与正文核验、摘要范围、原始 XML、Cookie、循环、Markdown、动态等待、资源限额和取消。真实 Chromium 经 CONNECT 访问本地 HTTPS 确定性服务，验证了浏览器 TLS、Cookie 跳转、POST、公共 IP 固定与私网重定向阻断。测试证书只在该测试浏览器按单一 SPKI 信任，产品不关闭 TLS 证书验证。类型检查和生产构建通过。

公开链接实际验证（独立临时配置，无个人浏览器，无付费模型，无用户项目写入）：

| 来源 | 结果 |
| --- | --- |
| PMC12128495 | 官方开放全文，约 63,762 字符 |
| PMC6414024 | 官方开放全文，约 47,994 字符 |
| PMC10061888 | 官方开放全文，约 31,201 字符；确认数字形式文档编号 |
| PMC11057359 | 官方接口无匹配记录，明确失败，不接受帮助页 |
| PubMed 41412135 | 摘要约 2,140 字符，明确非全文 |
| IDF China 页面 | HTTP + Readability，约 4,261 字符 |
| MDPI 指定页面 | 原生 Chromium 仍返回 HTTP 403 |
| Wiley / Lancet 指定页面 | 仍触发安全验证；原生 Chromium 仍停留 HTTP 403 安全验证；动态导航变化已作有限重试，未取得文章正文 |

安全验证页在个人浏览器可打开，不代表独立自动浏览器同样可读。剩余失败需其他开放来源或上传原文；本次未证明这些受限站点已可自动读取，也未核实文章统计结论。远程二进制 PDF/Office 仍需下载上传，资源介绍页不代表已获得完整报告。

Cloudflare 官方说明自动化浏览器不支持完成生产环境安全验证；部分 `*.challenges.cloudflare.com` 子域 DNS 失败是正常且非致命的检测行为。本次观察到的 brunhild 子域 ENOTFOUND 仅保留为诊断，不作为站点不可读的确定根因，也不会触发私网之外的致命取消。参考：[支持环境](https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/)、[验证问题说明](https://developers.cloudflare.com/cloudflare-challenges/troubleshooting/challenge-solve-issues/)。
