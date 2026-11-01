# D3 visualization integration

The project pins D3 7.9.0 and @types/d3 7.4.3. Public D3 APIs provide scales, shapes, axes and selection behavior; they do not replace Analyst evidence or calculations. There are still exactly five professional roles and no model configuration for Orchestrator.

## Workbench charts

FactChart uses shared chart geometry and React SVG: trends, bars for distributions/comparisons/categories/extrema/outliers, ranked horizontal bars and percentage donuts. Scalars and associations without real paired observations remain text/values. Structural scatter uses explicit source-linked observations, not invented pairs.

Year/year-month/date labels use UTC elapsed intervals. Unknown labels remain ordered categories with disclosure. Recognized invalid dates, duplicate/reversed times and unstable spans produce diagnostics with original data retained. Values, labels, units and order are not silently changed. Dense charts reduce tick labels, never observations. Mixed units cannot share a numeric axis.

Mouse/focus/arrow/Home/End navigation exposes readings. SVG title/desc and expandable complete tables preserve accessibility. The percentage remainder is explicitly mathematical completion to 100%, not a separately collected category. D3 pie/arc handles zero and 100%.

## Self-contained Builder artifacts

visualization-runtime.ts reads the installed official UMD distribution and ISC license, embeds it once before author scripts and keeps UTF-8 metadata first. Repeated packaging is idempotent. read_visualization_guide sends API/data guidance, not library source.

save_html validates references/HTML and embeds the runtime; store.commit uses the same packaging. Official artifacts and output/index.html therefore match. External script/link resources remain prohibited; CSP connect-src is none. Runtime version/digest participates in Builder fingerprints without altering role configuration.

Designer/Builder must preserve official values, units, mappings and IDs. Bar domains include zero; lines respect real time; donuts require a genuine whole/denominator. Use real paired observations for scatter and explicit structural edges for processes/hierarchy. No CDN, remote fonts, d3.csv/json/fetch or external data dependency is allowed. Existing projects are not automatically rewritten.

## Verification

The original integration added seven tests and passed 133 total, covering signs/zero/constants/singletons, dense/duplicate labels, real/invalid time, raw records/units, percentage boundaries, official license/version/order/idempotence and remote dependency rejection. Actual Chromium used embedded D3 under production CSP, made zero requests and produced valid PDF. Native Pi against a local deterministic provider exercised guide/save_html/Markdown submission.

Isolated taxonomy-preview.mts verifies ten statistical labels, seven eligible charts, rank focus, keyboard reading, full tables and 390px bounds. Current structural/browser coverage is recorded in VALIDATION.md. No external model generation-quality claim follows from these tests; arbitrary generated JS bindings, Canvas, animation and extra layouts still require verification.
