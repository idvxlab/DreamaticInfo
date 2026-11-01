# Researcher search and collection workbench

Implemented 2026-10-30 with five professional roles, deterministic scheduling and Markdown handoffs. The original path lacked a required plan, usable-body distinction, cross-session recovery and pre-report progress. The implementation adds persistent plans/queues, body checks, bounded reuse and read-only source progress. Researcher authors professional plans, not Orchestrator.

## Execution

1. Read the complete Brief, intent.md, uploads and read_research_progress.
2. Save objectives, scope/definitions, priority sources, stopping conditions and keyword tasks with save_search_plan. Upload-only work still needs a plan with an empty queue.
3. search_web uses an existing task_id; it cannot bypass the plan with arbitrary keywords. Tasks retain IDs, questions, keywords, priorities, targets, status, candidates, attempts, times and errors.
4. fetch_source accepts URL/task_id, reuses valid bodies first, then obtains public HTTPS material. Readable bodies become accepted; challenge/login/subscription/empty/short/error-data pages are rejected, network failures failed. Accepted is not proof of factual correctness or authority.
5. Preserve complete readable Markdown and raw responses. Formal research may cite only current-scope registered network sources with usable matching content digests.
6. Sources displays plans/tasks/candidates/bodies/diagnostics before formal completion, then official sources separately.

Plan tables represent ID, question, keywords, priority and target source using the supplied protocol headers or accepted English names. Priorities are 1–3, highest first. IDs and keywords are unique. Revised plans retain results for unchanged queries; removed tasks are archived and reusable if restored. Preserve every plan revision.

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

The reader later adopted cookies, Readability/Turndown and controlled native Chromium, with raw/rendered archives, official PMC/PubMed APIs and explicit abstract/full-text scope. Reader-policy versions allow bounded retries of historical failures while valid successes remain reusable. See [WEB_READER.md](WEB_READER.md) and [VALIDATION.md](VALIDATION.md).
