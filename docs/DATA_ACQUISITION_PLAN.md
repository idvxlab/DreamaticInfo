# Source-first acquisition implementation

## Contracts and dependency order

1. Replace advisory target names with registered connector IDs. Keep Markdown as the only authored plan/report; use source metadata and receipts as server-owned projections. Invalidate old research scopes without migration.
2. Add official discovery adapters (PubMed, Kaggle, World Bank, WHO, Eurostat, UN SDG, Zenodo) and an explicitly limited NBS official-directory route. Registry capabilities distinguish API discovery, known-code access and official-page access.
3. Introduce metadata-first inspection and selected file/query acquisition. Persist original responses, query scope, publisher, license, versions, hashes and transformations beside normalized evidence. Do not expose catalog metadata as observations.
4. Enforce supplemental web-search purposes and recorded reasons. Data-gap searches require previous dedicated-source attempts. Never silently fall back on connector failure.
5. Batch independent tasks with bounded concurrency, shared provider pacing, per-operation deadlines and partial results. Reuse successful version/config-bound work; limit candidates and model-facing previews. Preserve run/stage deadlines and five-role dependencies.
6. Surface connector, acquisition status, provenance and timings in the existing workbench. Validate evidence and dataset paths at formal handoff.
7. Run type checks, focused adversarial tests, the full suite and production build. Separately document real public API checks, authenticated-provider gaps and end-to-end measurement limits.

## Performance acceptance

Measure acquisition search/fetch duration, candidate volume, reuse, failures and supplemental searches alongside existing request-to-preview/delivery wall time. A deterministic concurrency benchmark proves scheduling only. Real quality/latency improvement requires paired identical Brief/provider/configuration runs; never infer it from mocked connectors. Optional exploration stops when questions have sufficient evidence. No professional stage starts before its official dependencies exist.

## Boundaries

Do not upgrade Pi, use personal browser profiles, read neighboring credentials or delete runtime data. No compatibility aliases or automatic conversion of old acquisition states. Preserve unrelated pending visual workflow changes. Unknown licenses, missing dates and unavailable data remain explicit. NBS has official-page/download support, not a claimed stable public API. Image discovery remains supplemental and usage conditions must be recorded.

## Implemented contract

- `list_data_sources` exposes capabilities. `save_search_plan` keeps its five-column Markdown queue, but target cells now require exact registry IDs. Query deduplication includes the target. `source-first-v1` creates fresh research scopes, with no legacy conversion.
- `search_sources` batches up to six independent saved tasks with configurable concurrency (default three). Each source returns at most five candidates. World Bank WDI and SDG public catalogs share bounded ten-minute process caches; private/selected data never shares that cache.
- `inspect_dataset` registers the official candidate's version, publisher, provenance, license and file list. Kaggle inspection uses separate view, metadata and file-list endpoints. Eurostat uses metadata-only SDMX discovery by exact code; it does not download all observations to search.
- `fetch_datasets` batches up to three selected files/slices. World Bank, WHO, SDG and Eurostat require explicit country/from/to; Eurostat supports dimension filters. Incomplete/oversized responses are rejected, not silently truncated. Kaggle pins the dataset version, requires a clear license and an upstream URL present in official metadata. Unknown `other` licenses are rejected. Zenodo pins the record/file. NBS is official-page access only, not an invented API.
- Acquisitions persist selected raw bytes, catalog metadata, normalized Markdown, digests, query parameters and transformations. Compact previews avoid injecting full datasets into search results. API/JSON tables have real headers; CSV/TSV retain original text; numbered Excel tables allow an explicit `first_row_header` calculation option. All selected observations remain available for independent recomputation.
- `save_research_coverage` records one Markdown row per task, binding actual source IDs, a specific gap, or both for partial coverage. Submission requires complete coverage records and intact evidence. Enough existing evidence can cover another question without another request.
- `search_web` requires a web task, purpose and reason. Data-gap discovery requires completed dedicated discovery through explicit related_task_ids. Image-search tasks cannot register page text as statistical evidence. Network failures never silently select another provider category.
- Original binaries use an attachment response; evidence text remains plain text. Archive extraction selects only the requested file, bounds expanded bytes/file counts and rejects traversal. Downloaded Office archives are checked before parsing.

## Operational configuration

`DREAMATIC_ACQUISITION_CONCURRENCY`, `DREAMATIC_ACQUISITION_TIMEOUT_MS`, and `DREAMATIC_ACQUISITION_MAX_ROWS` control bounded work. `DREAMATIC_KAGGLE_TOKEN` and `DREAMATIC_NCBI_API_KEY` are secret settings. NCBI keys are removed from stored URLs/errors; Kaggle authorization is never forwarded to storage redirect hosts. Existing public-IP pinning and global run/stage budgets remain active. Each batch result preserves partial successes/failures; cancellations do not schedule more tasks.

## Known limits

WHO GHO and Zenodo adapters are implemented but live access can fail (observed WHO 500 and Zenodo 403). No authenticated Kaggle download was verified in this run. Eurostat discovery needs a dataset code; NBS has no verified native catalog search. API slice-size rejection requires a narrower query rather than automatic arbitrary sampling. Structured JSON object arrays normalize to tables; arbitrary nested JSON and merged spreadsheets still need interpretation. Image search provides discovery links, not an automatic licensed-image download pipeline. No real model request-to-final-delivery performance comparison was run.

## API integration audit and corrections

The reported project failures were traced to actual Researcher tool calls: `from`
was repeatedly set to `worldbank` rather than a year, years were placed in
`filters.date`, and supported World Bank multi-country lists were rejected by the
local single-country guard. These were local contract failures, not World Bank
outages. The tool now has separate required statistical-slice and file request
schemas with year patterns and field descriptions. Selection validation happens
before metadata inspection or source-attempt persistence. Inspection results include
a concrete selection contract. World Bank supports bounded semicolon-separated
country/aggregate lists; SDG requires numeric M49, WHO ISO3, and Eurostat its own
geography codes. No missing dates or populations are guessed.

Official transport distinguishes HTTP denial/authentication, rate limiting and
server failure. It retries 429/502/503/504 once inside the existing operation
deadline, never loops on 403, and applies a thirty-second host cooldown after 403
or legacy WHO server failure. This does not bypass access restrictions. Original
project failure history is retained; no user project is automatically rerun.

WHO's official legacy notice announces GHO OData deprecation near end-2025:
https://www.who.int/data/gho/legacy . The configured legacy endpoint still returns
500 on minimal catalog and data requests. Registry guidance now explicitly warns
against prioritizing it; a verified replacement API is not configured. Zenodo
search and direct record endpoints return 403 from this environment; changing
keywords does not fix this condition. Neither is claimed healthy.
