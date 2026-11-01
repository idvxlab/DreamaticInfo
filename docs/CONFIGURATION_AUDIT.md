# Settings and .env wiring audit

Initial audit: 2026-10-30, 58 fields (search 4, reasoning 36, images 8, system 10). Historical counts below describe their checkpoints, not the current schema. No external model/image service was called.

## Flow and application

config-store.ts defines fields centrally. Project-root .env wins, then process environment/defaults; explicit empty values retain their meaning. Startup fills missing current fields. Vite and API use the same environment reader without .env.local/mode overlays.

Save validates a complete snapshot and serializes atomic .env updates while preserving comments/unrelated keys. Blank secrets preserve current values; reads reveal only configured status. Active jobs/exports block save. Saved nonrestart values rebuild Pi runtime for later tasks; manually editing disk requires restart or Settings save. PORT, DREAMATIC_WEB_PORT and DREAMATIC_WORKSPACE need restart. Workspace changes do not migrate projects.

## Consumers

The table omits DREAMATIC_ except PORT.

| Group | Fields | Consumer/behavior |
| --- | --- | --- |
| Search | SEARCH_PROVIDER/SEARCH_API_KEY | network.ts selects Brave/Serper/Bing/DuckDuckGo; auto prefers keyed Brave then Bing/DDG; Serper is explicit |
| Search | SEARCH_RESULTS/NETWORK_TIMEOUT_MS | Bound returned results and search/public HTTPS duration with parent cancellation |
| Reasoning | PROVIDER_TYPE/PROVIDER/BASE_URL/API_KEY/MODEL | model-settings.ts resolves connections; pi.ts registers public Pi native/custom providers |
| Reasoning | SUPPORTS_DEVELOPER_ROLE | Custom compatibility defaults false/system, independent of reasoning capability |
| Reasoning | PROVIDER_NAME/THINKING_LEVEL | Display name and session reasoning level, subject to model support |
| Reasoning | CONTEXT_WINDOW/MAX_TOKENS/MODEL_REASONING | Capability metadata for models outside the native catalog; known models retain native capabilities |
| Roles | PROVIDER/MODEL/BASE_URL/API_KEY/THINKING_LEVEL with role suffix | Independent overrides for CHATBOT/RESEARCHER/ANALYST/DESIGNER/BUILDER; blank inherits defaults and distinct native providers need correct auth |
| Images | IMAGE_BASE_URL/IMAGE_API_KEY/IMAGE_MODEL | Public Pi image provider; blank image key inherits reasoning key |
| Images | IMAGE_DEFAULT_SIZE/IMAGE_GENERATION_ENDPOINT/IMAGE_RESPONSE_FORMAT | image-provider request; blank endpoint uses default path, auto omits response_format; official commission dimensions override default where supplied |
| Images | IMAGE_RESPONSE_MAX_BYTES/IMAGE_TIMEOUT_MS | Bounded response and URL-download bytes/time with public-network policy |
| System | SKILL_PATHS | Native discovered read-only role Skills; paths enter fingerprints, same-path body edits require deliberate role rerun |
| System | PORT/WEB_PORT/WORKSPACE | API/Vite/proxy/same-origin ports and project/recycle root; restart required |
| System | CHROME_PATH | browser.ts/shared browser options; explicit nonexistent paths fail, blank permits discovery |
| System | UPLOAD_LIMIT_MB/MAX_FETCH_BYTES | Multer/ingest and publicGet; current limits appear in errors; extracted text also has an 8MB cap |
| Execution | STAGE_TIMEOUT_MINUTES/RUN_TIMEOUT_MINUTES/RETRY_ATTEMPTS | Shared stage deadline across attempts and whole-run deadline; transient errors only |
| Execution | MAX_REPEATED_SUBMISSIONS/MAX_INVALID_SUBMISSIONS | submission-policy and draft progress guards, defaults 3/5 |
| Export | PDF_TIMEOUT_MS | Shared launch/render/print budget without hidden page cap |
| Research | SOURCE_MIN_TEXT_CHARS/RESEARCH_MAX_TASKS/RESEARCH_REQUEST_ATTEMPTS | Body threshold, queue length and scoped bounded requests |
| Reader | WEB_READER and WEB_* time/request/byte/concurrency options | public-http/web-reader/scholarly-reader; see WEB_READER.md |

Connection/search/image settings enter affected role fingerprints. Saving does not run projects; continuing reconciles affected stages/downstream. AssetService replaces the old imageCacheKey path and binds commissions, palette, art direction and relevant configuration/credential digests.

## Historical fixes and verification

The initial audit repaired missing Skill-path invalidation, image-endpoint cache binding, PDF hidden timeout/silent path fallback, Brave truncation, hardcoded error limits and inconsistent Vite/API precedence. Twelve configuration tests covered field/example consistency, independent role auth/capability, consumers and limits; all 42 tests/check/build passed. Local health/Settings/proxy returned 200 with redacted secrets, pendingApply=false and no restart requirements. This did not verify external authentication/service compatibility.

Subsequent counts were 60 after submission budgets, 63 after research settings, 70 after reader integration and 73 after independent static/scholarly/body-ready timeouts. Run budget was added later. Current fields are defined by CONFIG_FIELDS and verified against .env.example rather than a historical hardcoded count. See VALIDATION.md for current acceptance. Configuration wiring is not proof of live generation quality.
