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

## Editorial visual system and review

Design composition requires a core message, information hierarchy, primary visual,
typography, background treatment, decoration rules and concrete self-review.
Schema-driven Markdown parsing and existing fingerprints reject stale contracts
without conversion or history deletion. The workbench exposes these decisions;
its geometry view remains a schematic. Screenshot review evaluates design adequacy
as well as implementation fidelity, using the same Designer role and existing
bounded owner routing. Asset fallbacks are surfaced in derived delivery notes and
summary. See [VISUAL_DESIGN.md](VISUAL_DESIGN.md) for verification boundaries.

ExecutionBudget identifies its scope in timeout errors: run and named role-stage
limits remain independent and unchanged. A stage timeout must not claim that the
run deadline expired. Designer commission repairs use a revision-checked asset
patch, and narrative-to-visual expansion establishes a single new progress baseline.

Generated image bytes stay on the server. generate_image returns metadata and
embedding instructions only. save_html/patch_html resolve img[data-asset-id] to
the current official generated version before validation. Builder read-back strips
those embedded bytes along with the packaged D3 library; the server restores them
on the next save. Asset presence/version/fallback checks remain mandatory.

## Visual acceptance ledger

Review tables validate their header and parse every data row even when the
separator line is omitted. Asset targets resolve to their using component rather
than being silently dropped. On repair rounds the same Designer receives previous
open issues, versioned review history, binary-free source-image size/CSS evidence
and up to four original asset images through native image input. Open IDs must be
retained or explicitly closed in Markdown; closed IDs cannot be reused. New
regressions use new IDs. Missing visibility is not proof of a missing image, and
the highest visible tick is not proof of the numerical domain limit.

state/reviews/history.json records open/closed IDs and Builder revisions; the
pending repair checkpoint retains the same history across interruptions. Designer
owns unsuitable source imagery/composition; Builder owns its opacity, crop and
placement. Existing deterministic owner routing and two-repair limit remain.

When that limit is reached, the committed HTML stays usable and Builder stays
completed. Task visual_review.status is needs_revision with current issues, rather
than reporting a generation failure or visual success. The UI shows this separate
acceptance result and preserves preview/export. Starting the unchanged completed
project does not silently restart repair. A deliberate rerun/invalidation can
produce a new version for review, but continuing does not reset repair counts.
Unsupported vision never closes previously open issues.

## Explicit operations and rendered samples

POST design-operation requires repair/redesign and a reason; repair may specify an
explicit professional owner (default Builder). Redesign requires committed Analyst
facts and creates a new design draft scope, invalidating Designer/Builder only.
Continue preserves the current scope and direction. Operation reasons enter model
context; original input and immutable history are retained. No operation silently
resets persisted repair counts.

Production Builder receives a sample callback from deterministic Orchestrator and
cannot submit before save_visual_sample. The server validates completed/unfinished
regions, renders desktop/mobile/print, stores versioned HTML/screenshots/diagnostics,
and invokes the same Designer model. Builder issues stay local, other owners cause
formal revision before subsequent implementation. Per-contract sample checks are
bounded at two; concept/asset/final repairs share the persisted two-repair allowance,
run deadline and model/tool budgets. Unsupported vision is explicitly unperformed.
Fixture runners injected in tests do not simulate model artistic judgment.

Image generation and decode checks are separate from Designer acceptance. Alpha
bounds describe nontransparent pixels at alpha > 8, not semantic subjects. Content
cache hits reopen visual acceptance; dimensions/format/ratio/transparency failures
use the declared fallback. Binary payloads remain server-side. The state/assets
projection exposes metadata only. Durations overlap and cannot be summed into wall
time; SDK usage cost remains the provider's reported estimate, not an invoice.

Sample versions include their check attempt as well as contract/content, so a
later review cannot overwrite the earlier sample/review. Read-back verifies the
sample digest. The workbench computes component-code changes and completed sample
regions against delivery, without interpreting those differences as artistic
improvement. The first accessible sample participates in first-preview timing.

## Source-first acquisition

Research targets are registered connector IDs, not advisory institution names.
`source-registry.ts`, `source-connectors.ts`, `acquisition-scheduler.ts` and
`dataset-acquisition.ts` separate discovery, metadata inspection, bounded selected
file/slice acquisition and normalized evidence. ResearchWorkbench owns persisted
coverage, source/version/config-bound reuse and explicit supplemental search.
`search_sources` and `fetch_datasets` batch independent work to reduce model
roundtrips. `save_research_coverage` closes each planned question with actual
source IDs or a specific gap before formal submission. The five professional
roles and deterministic dependency ordering remain unchanged. See
[acquisition implementation](DATA_ACQUISITION_PLAN.md).

## Workbench information hierarchy

The workbench presents current work status, actual sample/preview access and open
issues. The modification form is separate from default-collapsed diagnostic
records. Requirement details include user/reference/brand origins only; inferred
ChatBot defaults are not presented as product requirements. Final visual choices
belong in the Designer report. ChatBot must not invent topic-based industry rules
or mandatory palettes/charts/timelines.

Invalidation callers supply the current operation's reason rather than reusing a
previous execution reason. Diagnostics distinguish the original affected stages
from those still incomplete; a resolved invalidation remains a historical record.
Ordinary run/continue is never labelled as an established design direction.
Only current completed Builder revisions supply final visual-review issues;
invalidated Designer samples are not shown as current previews. Project switches
reset the local modification editor; polling preserves edits within a project.

## Model response inactivity

Pi sessions have a model-silence watchdog independent of stage/run deadlines.
`DREAMATIC_MODEL_IDLE_TIMEOUT_MS` defaults to 90000. Turn starts and streamed
message updates arm/reset it; assistant completion and tool execution suspend it.
A waiting notice precedes termination. On expiry, native session abort is requested
and the caller is released even if the provider stream does not settle promptly.
The failure states that model response is missing rather than implying that data
search is still running. Committed work and research progress remain reusable;
no automatic paid retry is initiated for model silence. Normal parent/stage
cancellation remains authoritative.

## Research correction contracts

Research feedback separates parameter correction, unmet prerequisites, source
unavailability, interruption and unexpected internal errors. The Pi-facing tools
return next_action and exact current IDs for expected correction. Batches expose
per-item feedback while retaining successes. Repeated unchanged rejected calls are
blocked before execution and the third rejection terminates explicitly.

ResearchWorkbench owns deterministic candidate IDs, official record verification,
explicit supplemental-task references and complete/partial/missing coverage.
compose_research_report assembles registered source/dataset metadata into one
formal Markdown artifact from a small authored narrative, saves versioned drafts,
and revalidates scope/input/content/evidence before revision-only submission.
See [the preimplementation plan](RESEARCH_TOOL_REPAIR_PLAN.md).

Analyst latency controls now use compact calculation receipts, paginated verified
receipt inspection, and 1–3-fact Markdown narrative batches with server-owned exact
computed fields. Model metadata snapshots distinguish streaming text, tool argument
generation and tool execution without exposing reasoning. Idle, absolute model-call
and Analyst durable-progress clocks are bounded independently; saved calculations
and revisions survive interruption. See [Analyst workbench](ANALYST_WORKBENCH.md).

## Builder rejected-HTML recovery

HTML resource validation parses CSS syntax through css-tree instead of scanning
quoted data URLs with a regular expression. CSS and document coverage diagnostics
are aggregated. A bounded HTML repair draft is persisted under an input-bound
Builder scope with immutable revisions, content digests and an atomic pointer.
read_html_draft reads repair input; patch_html prefers that draft, then official
output. Only passing HTML enters the accepted in-memory delivery slot. A rejected
new edit clears that slot, so an older accepted page cannot be submitted silently.

Builder HTML failures share one bounded policy across save/patch/native argument
rejection. Stable issue signatures exclude revision IDs; fewer issues than the
best saved result reset consecutive failures, while changed content or oscillating
issues alone do not. Formal Markdown submission remains independently validated.
Full draft recovery rechecks the current inputs and resources on save or patch;
invalid drafts never bypass sample, render or final-delivery gates.

## Model call quotas and explicit extensions

DREAMATIC_MODEL_RUN_LIMIT bounds model turns in one explicit start/continue and
all its automatic retries. DREAMATIC_MODEL_TASK_LIMIT bounds cumulative turns for
the same requirement scope; both default to 120 and are configurable. Historical
model/tool/asset/retry/repair counts and reported cost remain persisted. Only the
run_model counter starts at zero on an explicit new invocation. Changing these
settings affects subsequent invocations; it never erases history.

POST /api/projects/:id/model-budget accepts an explicit integer amount (1–1000).
It reserves the scheduler slot, rejects running projects and changed scopes,
persists a timestamped additive grant (at most 10000 extra turns per scope), and
updates the state projection without starting generation. The conversation shows
run and cumulative used/limit. On cumulative exhaustion the user can add 40 calls,
then separately continue. Grants do not change cost ceilings, repair counts,
timeouts, existing results or upstream dependencies. The usage ledger preserves
the grant history during later runs. Exhaustion errors identify run versus task,
used/limit and the corresponding recovery action.

## Recoverable sample repairs

Builder samples have a separate input-bound HtmlWorkbench scope and immutable
HTML/completed_components revisions. The input pointer is saved before rendering
or visual review; failures and interruptions never imply sample acceptance.
read_visual_sample_draft restores sample input and diagnostics. patch_visual_sample
applies exact local replacements and reruns sample validation and review. While a
sample remains unaccepted, patch_html routes an existing sample draft through the
same sample path. Unfinished sample saves with known completed metadata are also
routed through sample validation, not final coverage checks. Final HTML acceptance
remains separate and still rejects unfinished regions. Native argument rejection
and repeated sample failures use the existing bounded HTML failure policy. No
model/stage/run limits or visual repair allowances are increased.
