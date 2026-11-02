# Research tool contract repair plan

Implementation order is fixed before code changes:

1. Coverage accepts evidence plus a remaining gap; derive complete/partial/missing. Supplemental data-gap searches use explicit related_task_ids referring to completed dedicated tasks, never question text equality. Preserve Markdown plans/coverage.
2. Assign deterministic candidate IDs from connector/record/URL. Expose exact current task IDs, candidates and next actions. Verify known official record IDs through registered adapters (World Bank, SDG, Eurostat, PubMed, WHO, Kaggle, Zenodo), then register verified candidates; never accept arbitrary API endpoints.
3. Compose formal research Markdown from a small authored Markdown narrative (summary, selected source IDs, limitations, notes). Resolve immutable source/dataset metadata server-side, save an immutable draft revision with input/content fingerprints, and submit by revision after freshness/evidence checks. Existing formal Markdown remains the editable artifact.
4. Classify recoverable tool feedback as parameter/prerequisite/unavailable/interrupted. Preserve unexpected failures. Batch results report each failure and retain successes; logs and workbench use the same categories.
5. Track repeated tool/argument/rule/state failures per session. Identical rejected calls in unchanged state return targeted guidance without repeated execution. Three identical rejections stop the stage explicitly; successful state changes allow a new attempt. Run/tool budgets remain authoritative across sessions.

Acceptance: partial-coverage roundtrips, explicit search associations, stable candidate identity, official known-code validation, canonical metadata composition, source/draft tampering and staleness, batch feedback, native Pi draft submission, repeat rejection and state-change reset. Run focused tests, full suite, type check and production build. Keep runtime originals/history and unrelated edits. No automatic paid/model rerun. Record real-service verification limits honestly.

## Completion record

All five steps were implemented in the stated order. Source/candidate metadata
remains server-owned and formal handoff remains Markdown. Recoverable feedback
is exposed without generic failure wording, while internal errors and repeated
invalid calls remain explicit failures. The final acceptance details are recorded
in VALIDATION.md. No user project was automatically resumed or regenerated.
