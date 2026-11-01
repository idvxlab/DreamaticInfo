# Architecture and protocols

React → Express → Orchestrator → ChatBot → Researcher → Analyst → Designer → Builder.

Orchestrator selects stages, checks dependencies, executes, commits, persists and recovers. Professional content belongs to independent Pi sessions. There are exactly five professional model configurations; Orchestrator has none.

## Workspace and authored artifacts

Each project lives in `workspace/projects/<UUID>`: `input/` holds originals, `research/` normalized/source material, `assets/` images, `output/` delivery, `state/versions/` immutable history and `state/sessions/` Pi sessions. Models use controlled tools rather than arbitrary writes or shell access. Read access is limited to the current project and discovered read-only Skills.

Markdown is the sole authored handoff. The program parses headings, field/value tables, lists and record tables into internal indexes, retaining original text and notes. JSON is internal state/index data, not a second model-maintained report. Builder stages HTML with save_html and commits it with its Markdown report.

Schemas live in `schemas/`, shared types in `packages/shared/`. Fact evidence/source_ids/relations and design fact_ids/mapping require reference validation. Correlation cannot be presented as causation; causal relationships need explicit evidence.

## Persistence and execution

Stage fingerprints cover the Brief, original-file digests, upstream official artifacts, role configuration, role contract and Markdown protocol version. Artifact digests include Markdown and compiled indexes. Recovery verifies files/fingerprints and invalidates the first affected stage and its downstream dependencies. Commit writes the immutable version before atomically changing the checkpoint; canonical files are repairable views and task-state.json is a recovery projection.

One active run is allowed per project; projects may run concurrently. AbortSignal cancels Pi on pause while retaining complete committed stages. Restart changes leftover running states to interrupted. Automatic retries cover transient network/rate-limit errors only; default attempts are three and configurable in `.env`.

ExecutionBudget provides shared run/stage deadlines. All stage retries share one deadline; the default run limit is 45 minutes. Central count limits bound model turns, tools, assets, network retries and repairs. Pi's internal retry is disabled. Continuing after a pause starts a new run budget while history and persisted repair counts remain.

## Configuration and Pi

All runtime configuration is in project `.env`. config-store owns metadata, range checks, secret redaction and serialized atomic saves. Settings reuses Art's four-module forms. Ports/workspace require restart; other saved values affect subsequent tasks.

Pi ModelRuntime uses in-memory credentials and project provider registrations, not global auth or models.json. Every role independently selects provider/model/baseURL/key/thinkingLevel. Connection digests participate in invalidation. Native resource loading discovers technical/artistic and configured role Skills; read only opens approved discovered knowledge files. Image transport uses Pi's public ProviderImages contract and Art's OpenAI-compatible request fields.

## Project lifecycle

An empty Brief creates a persisted draft immediately; only valid user input starts Pi. DREAMATIC_WORKSPACE defaults to workspace/projects. Display names are stored separately in project-display.json and override generated titles on read; renaming while running does not change fingerprints.

Project writes are serialized by the project lock. Store and scheduler reject deletion during execution. Deletion renames the directory into the same root's .trash without removing its contents. UUID scanning ignores the recycle directory. The frontend removes deleted entries and stops related polling/subscriptions, preventing stale responses from repopulating them.

## Markdown submission

See [MARKDOWN_PROTOCOL.md](MARKDOWN_PROTOCOL.md). submit_stage accepts a Markdown string; Analyst/Designer may submit a saved draft_revision. Templates come from business schemas, but full JSON Schemas/upstream JSON are not injected. read_handoff reads allowed complete reports and brief.md. Originals, quotations and source IDs remain traceable.

Parsing, business validation, references and real evidence are checked in order. Formal errors, malformed draft tools and stagnation are counted separately; default limits are three repeated states or five consecutive failures/no-progress events. Ordinary pending draft issues return successfully. Fewer issues, additional verified facts or repaired parse structure reset the window; deleting facts, losing verified items or exchanging equally wrong quotations does not. Stage/network budgets still apply, including Pi argument rejection before tool execution. Technical errors cannot be turned into user requirement questions. The UI exposes failures and validation results.

Formal downloads are Markdown only. Internal artifact.json retains protocol, original Markdown, index and notes; there are no root-level report JSON copies. Edit APIs accept only {markdown}. Missing protocol/original documents are rejected without conversion. Configuration reads only current keys, without old JSON/env aliases.

## Research and reading

ResearchWorkbench persists a model-authored Markdown plan, keyword queue, candidates and collection records. Scope binds requirements/uploads/intent/body thresholds. progress.json is atomically serialized under research/runs/<scope>; plan-N.md preserves versions. Tools require the plan and task_id. Successful requests survive sessions; failures need explicit bounded retry. Challenge/login/subscription pages, empty/short bodies and invalid data responses remain diagnostic rather than evidence. Only registered bodies matching their digests are accepted. research_progress feeds source-page previews before formal research.

public-http.ts uses tough-cookie and validates/pins public IPs at every hop, detecting no-progress loops. document-reader.ts runs JSDOM without scripts/remote resources, Mozilla Readability and Turndown GFM. web-reader.ts handles auto/http/browser; browser-egress.ts provides a public-IP-pinned CONNECT tunnel covering redirects/subresources. scholarly-reader.ts uses official PMC/PubMed BioC interfaces, verifies identifiers and preserves abstract/full-text scope and limitations. Limits cover concurrency, requests, bytes and total time. Raw/rendered archives and diagnostics remain traceable. See [WEB_READER.md](WEB_READER.md).

A stage's startup count includes resume, manual rerun and automatic retry, not source-request counts. Manual pause and service shutdown have distinct UI reasons; starting again clears stale stage errors without deleting valid results. Transient retries are visible in the event stream.

## Analyst and Designer workbenches

AnalystWorkbench scopes drafts by current requirements, intent, research and actual source digests. evidence-view creates stable source/digest/block views. Analyst quotes one real block with original IDs. Schema/source/quotation issues are aggregated into Markdown. save_analysis_draft/patch_analysis_fact create immutable versions before switching the pointer; read_analysis_draft restores them and draft_revision submits the same Markdown with full final validation.

analysis_progress is a read-only projection for polling/SSE. It shows saved facts, issues and counts before submission, retains paused drafts, hides stale scopes and switches to official facts after commit. Downloads are current-scope/current-revision Markdown; readOnly mode does not rewrite evidence. Downstream roles read only formal artifacts. See [ANALYST_WORKBENCH.md](ANALYST_WORKBENCH.md).

DesignerWorkbench similarly binds requirements, official facts, research, design schema and actual source digests. Native read/save/story/component/reorder tools expose versions and precise issues. design_progress feeds narrative, evidence, Analyst relationships and explicit story_ids component mappings. Only formal design starts Builder. See [DESIGNER_WORKBENCH.md](DESIGNER_WORKBENCH.md).

## Facts and implementation

Ten statistical types are separate from derivation and required specification. source-calculation reads real evidence tables; fact-statistics executes deterministic operations and receipts under state/calculations. Submission recomputes from current sources and checks values, series and units. Model-supplied arrays cannot be formal source credentials. Metric and series units are checked separately. No old-analysis migration is provided.

Structural semantics live in packages/shared/structure.ts; structure-source.ts extracts source tables; StructureChart.tsx draws accessible workbench views. Timeline/process/hierarchy/scatter records have direct evidence and dedicated mappings. Maps/networks/Sankey remain unsupported.

D3 7.9.0 computes chart geometry and React renders workbench SVG. Designer/Builder read the controlled visualization guide. save_html and formal commit embed the same official local runtime with its license. Library version/digest enters Builder's fingerprint; HTML/preview/PDF share a self-contained artifact without CDN or network permission.

AssetService replaces inline Pi image execution. Two bounded generation jobs overlap Builder implementation. Cache keys bind commissions, palette, art direction and configuration. Generated/fallback use is checked in HTML. visual-review.ts uses the existing Designer model's declared image capability and Markdown findings; production scheduling routes explicit owners through at most two repairs, persisted in state/repair.json. Unsupported vision is disclosed.

## Delivery, safety and observation

Builder delivers independent inline HTML. External scripts/resources are prohibited; generated images are embedded. Preview runs in a sandbox iframe. delivery-quality.ts gates script/console errors, broken images, horizontal overflow and detectable text clipping across desktop/mobile/print. Content/version-keyed checks and screenshots are cached. Other geometry remains diagnostic, not aesthetic proof.

PDF is on demand, using Chromium on the same HTML with fonts/images ready and animations disabled. Content/page/browser-configuration digests and a PDF digest control reuse. Failures retain HTML. run-metrics.ts provides append-only measurements and read-only workbench summaries; content-digest.ts caches stable file hashes. Wall time starts at the first valid user message, includes historical waits and is distinct from overlapping operation durations.

The API is loopback/same-origin only with Host/Origin checks and upload limits. Public deployment requires authentication, authorization, quotas and tenant isolation. Current implementation and real-service limits are documented in [INFOGRAPHIC_IMPLEMENTATION.md](INFOGRAPHIC_IMPLEMENTATION.md); the plan is [REFACTOR_PLAN.md](REFACTOR_PLAN.md).

Builder local repair uses `patch_html` exact unique replacements against the latest
staged HTML or existing delivery. Validation and runtime embedding complete before
replacing the in-memory draft; formal submission still commits HTML and Markdown
atomically. Builder reads of output/index.html omit only the system-packaged D3
script, retaining authored scripts. HTML tool argument rejection before execution
participates in the bounded validation policy. No shell access is provided.
