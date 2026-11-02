# Researcher search and collection workbench

Implemented 2026-10-30 with five professional roles, deterministic scheduling and Markdown handoffs. The original path lacked a required plan, usable-body distinction, cross-session recovery and pre-report progress. The implementation adds persistent plans/queues, body checks, bounded reuse and read-only source progress. Researcher authors professional plans, not Orchestrator.

## Execution

1. Read the complete Brief, intent.md, uploads and read_research_progress.
2. Save objectives, scope/definitions, priority sources, stopping conditions and keyword tasks with save_search_plan. Upload-only work still needs a plan with an empty queue.
3. search_sources executes up to six saved dedicated-source task IDs with bounded concurrency. Targets are exact registry IDs, not advisory text. search_web is supplemental only and requires purpose/reason; data-gap searches use related_task_ids referencing completed dedicated tasks; question wording is not compared. Tasks retain IDs, questions, keywords, priorities, targets, status, candidates, attempts, times and errors.
4. inspect_dataset checks an official candidate; fetch_datasets acquires up to three selected files or country/year slices. fetch_source accepts URL/task_id for articles, NBS official pages and justified supplemental text, reuses valid bodies first, then obtains public HTTPS material. Readable bodies become accepted; challenge/login/subscription/empty/short/error-data pages are rejected, network failures failed. Accepted is not proof of factual correctness or authority.
5. save_research_coverage binds every planned question to evidence, a gap, or both for partial coverage before submission. Preserve complete readable Markdown and raw responses. Formal research may cite only current-scope registered network sources with usable matching content digests.
6. Sources displays plans/tasks/candidates/bodies/diagnostics before formal completion, then official sources separately.

Plan tables represent ID, question, keywords, priority and target source using the supplied protocol headers or accepted English names. Priorities are 1–3, highest first. IDs are unique; keywords are unique within each connector. Revised plans retain results for unchanged queries; removed tasks are archived and reusable if restored. Preserve every plan revision.

## Storage and reuse

- research/runs/<scope>/progress.json: internal plan, queue, archived queries and source records.
- research/runs/<scope>/plan-N.md: original Markdown plan versions.
- research/web-<UUID>.md: readable body or rejection diagnostic.
- research/web-<UUID>.raw.txt: raw response; rendered archives are described in WEB_READER.md.
- execution-log.md: tool progress, checks and errors.
- research.md: the formally submitted report.

Scope binds full requirements, upload IDs/digests, intent and body thresholds. Pause/retry/restart reuse same-scope successes; changed inputs use an independent scope and never silently adopt old evidence. Search keys include connection, credential digest and result count. Failures require explicit retry=true; changed connections receive their own request budget. URLs deduplicate without fragments; concurrent identical requests share work and may associate multiple tasks. Missing/tampered bodies invalidate cache.

State changes serialize atomically; network work runs outside locks and merges completion. Interrupted running/fetching records become explicit retryable failures on reopen, not a blank plan.

## Configuration and API

Search advanced settings persist to .env. DREAMATIC_SOURCE_MIN_TEXT_CHARS defaults to 180, DREAMATIC_RESEARCH_MAX_TASKS to 40 and DREAMATIC_RESEARCH_REQUEST_ATTEMPTS to 3. Short parseable structured data has separate handling. Existing network, result-count and stage/run budgets still apply. Exhaustion requires a different source/query, deliberate configuration change or a disclosed gap, not unlimited retry.

GET /api/projects/:id projects research_progress. GET /research/plan returns the original plan; /research/sources/:sourceId/text or raw returns plain content from current-scope server records after path checks. There is no arbitrary file-path argument.

Search snippets/readability do not prove accuracy, authority, completeness or comparable definitions. Researcher/Analyst must verify those. There is no CAPTCHA bypass or automatic unlocking; remote binary PDF/Office files require upload. Dynamic extraction may be incomplete.

## Verification history

The initial 63-test checkpoint covered plan/settings constraints, body/error-page extraction, deduplication/serialized state, request budgets, interruption, plan/session reuse, tamper detection, scope isolation, rejection, SSR and HTTP access before report completion. Native Pi used local deterministic providers and temporary directories; no live paid model/topic research occurred. Browser tooling was disabled at that historical checkpoint, so SSR was not presented as visual verification.

The source-first replacement is documented in [DATA_ACQUISITION_PLAN.md](DATA_ACQUISITION_PLAN.md). Dedicated API tables and selected repository files now have acquisition receipts, raw/catalog/material digests and independent calculation support. Old research scopes are not migrated.

The reader later adopted cookies, Readability/Turndown and controlled native Chromium, with raw/rendered archives, official PMC/PubMed APIs and explicit abstract/full-text scope. Reader-policy versions allow bounded retries of historical failures while valid successes remain reusable. See [WEB_READER.md](WEB_READER.md) and [VALIDATION.md](VALIDATION.md).

## Incomplete query display

A task-level keyword cell cannot contain protocol empty markers such as 无, none,
null or a blank value. Save validation requires an actual query; execution also
rejects retained placeholder records before any request or attempt increment.
For such records the workbench displays the real question with a pending-keyword
status, never implying that searching is unnecessary or that no results exist.
The standalone 无 marker remains valid for an entirely empty upload-only queue.
Historical plans and records remain unchanged.

## Guided research tools

Discovery returns deterministic candidate IDs. Use those IDs for inspect_dataset
and fetch_datasets, and current task IDs from read_research_progress.
verify_official_record resolves a known provider record code at registered official
endpoints before admitting it as a candidate, independent of keyword ranking.
Unknown task/candidate feedback includes valid IDs and a concrete next action.

Coverage preserves useful partial evidence alongside remaining gaps. Formal report
composition uses model-authored Markdown narrative sections (概要, 采用来源, 局限,
说明). compose_research_report resolves registered metadata and datasets into the
formal Markdown, saves an immutable revision, and returns draft_revision for
submit_stage. Recovery lists the latest draft; changed inputs or tampered files
require recomposition. No source fields, dates or paths need to be retyped.

Recoverable tools return explicit feedback categories, not a generic failure.
Batch results retain successful items and report unavailable items individually.
Identical rejected tool/arguments/state calls are not executed again. Three
identical rejections stop the stage explicitly; argument key order does not bypass
this rule. Native Pi schema rejection remains strict and is separately bounded.
Unexpected internal errors remain failures. The run/tool budget is unchanged.
