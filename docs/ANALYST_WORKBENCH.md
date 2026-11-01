# Analyst evidence, drafts and local repair

Implemented 2026-10-31. Initial failures included rewritten quotations absent from sources, distribution used as a relationship type and renamed source IDs. Rewriting long reports exhausted the stage budget. The solution preserves strict evidence while providing authoritative catalogs, aggregated diagnostics, immutable drafts and per-fact repair.

## Evidence

read_source_catalog returns official Research source IDs, titles, paths, digests and limitations. Copy IDs exactly. read_evidence ranks deterministic blocks by optional keyword and supports pagination/block selection; ranking never changes evidence matching. Keep the E- block ID in evidence.location and copy a contiguous original passage into quote.

Display normalization preserves cell order/boundaries, digits, punctuation, years, units and superscripts. Simple HTML tables become readable views; merged cells remain HTML without invented headers. Formatting/entities/whitespace can normalize, but separate passages/cells cannot be stitched into a fabricated quotation. Explicit E- locations must match that source block. CSV/TSV/TXT/MD/JSON uploads also expose original text. Block IDs bind source ID, digest, position and view version; source digests cover all verification text. Originals and formal reports are never rewritten by evidence views.

Traceable quotation does not prove statistical correctness, representative sampling or agreement between a calculation and its description. Analyst retains professional responsibility.

## Diagnostics and tools

Unparseable drafts report exact format errors. Parseable drafts aggregate schema, enum, duplicate ID, source, quotation/location and relationship errors into a Markdown location/problem/repair table. Statistical types and derivation are independent; relationship types are temporal/comparison/correlation/causal/contains/context. No source-alias or enum guessing occurs. Structural contracts are described in [DATA_FACT_TYPES.md](DATA_FACT_TYPES.md).

- read_analysis_draft returns revision/path/verified facts/issues, optionally one fact_id.
- save_analysis_draft saves a nonempty, bounded Markdown draft even with pending validation issues. Updating an existing draft requires base_revision.
- patch_analysis_fact takes current revision, fact_id and one complete fact-item section in the supplied template. Existing IDs replace one item, new IDs append; other original items and notes remain. Reject mismatched IDs, stale revisions and extra sections.
- submit_stage accepts draft_revision to fully validate and submit the saved Markdown without resending it, or accepts markdown directly.

Save an evidence-complete batch, then append/repair locally. Add relationships when targets exist. A repaired fact can pass while unrelated issues remain; that is not a failed formal submission. Pending preflight issues return successful saved-draft reports.

Formal failures, malformed draft arguments and no-progress states have separate counters using DREAMATIC_MAX_REPEATED_SUBMISSIONS and DREAMATIC_MAX_INVALID_SUBMISSIONS, including Pi argument rejection before tool execution. Session startup establishes a baseline. New verified items, fewer issues or restored parsing count as progress while preserving previous facts/verified items. Revision changes, replacement wrong quotations, deletion or equally bad states do not. Useful repairs may exceed five operations; repeated stagnation stops at configured limits. Final submission always rechecks everything.

Association units r/rho/tau require [-1,1]; quoted OR/RR/HR are finite nonnegative ratios and may exceed one. Unknown units are rejected. Deterministic calculation supports Pearson, not regression-derived OR/RR/HR. Preserve quoted methods, reference groups and adjusted definitions; none proves causation.

## Storage and invalidation

state/drafts/analyst/<scope>/ stores evidence-<source-hash>.md and revisions/<UUID>/{draft.md,validation.md,meta.json}; current.json switches only after the whole revision is written. Scope binds Brief, intent, research, actual source digests, schema and view version. Reads/repairs/submission revalidate source content. Changed inputs use a new scope; serialized version checks prevent stale concurrent overwrites. Old verification is never blindly trusted.

Drafts are not formal datafacts.md and cannot start Designer. Formal commit remains Orchestrator-owned. Historical unsaved model responses are not imported automatically. Saved drafts recover across pause, failure and restart.

## Read-only UI and API

analysis_progress and GET /api/projects/:id/analysis/progress project the current scope without model execution or evidence writes. Show saved/verified/pending facts, issue counts, evidence and precise fixes; reuse official cards with an explicit unsubmitted-draft label. Support pending-only and relationship filters, safe invalid-enum labels and invalid-confidence handling.

Existing 1.8-second detail polling and SSE refresh update saved state. Pause/failure retains drafts; parsing failures retain document/issues; changed requirements/sources hide stale facts; formal completion replaces drafts. Downstream roles still read only official artifacts.

/analysis/draft?revision=<UUID> and /analysis/validation?revision=<UUID> serve only current-scope/current-revision plain Markdown. Reject stale/unknown revisions and arbitrary paths/formats. Downloads state that drafts are not submitted.

## Verification history

The initial implementation passed 84 tests, covering verbatim evidence, changed numbers/years/units, cross-block rejection, combined diagnostics, invalid-draft persistence, local append/repair, revision protection, source/intent invalidation, progress budgets and native Pi against a local deterministic provider. API/UI tests later covered read-only polling, paused drafts, malformed documents and formal switching.

The isolated tests/fixtures/analysis-preview.mts browser script checks filters, automatic updates and wide/narrow layouts after build; it deletes only its temporary project. No external paid model or user project was rerun. See [VALIDATION.md](VALIDATION.md) for current totals and real-provider limitations.
