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

## Calculation contract feedback

read_evidence appends deterministic table hints: source/block IDs, table kind,
zero-based columns and whether the original-row header option applies. Official
API/JSON tables already have explicit headers; first_row_header must be omitted
or false. The true option remains restricted to verified first-row headers in
system-numbered original spreadsheet tables. An invalid option returns its exact
correction and columns, without changing data or dropping the first observation.

Analyst calculation/evidence tools use categorized corrective feedback and the
existing three-identical-rejection guard. Difference helpers require exactly two
values; unbound helpers never produce formal source receipts. Draft preflight and
formal submission retain their existing independent repair budgets and source
integrity checks. Unexpected errors still fail explicitly.

## Explicit grouped trend calculations

calculate has disjoint source-bound and auxiliary argument schemas. Source mode
requires source_id/block_id/label_column and excludes values/labels/paired_values;
auxiliary mode cannot carry source location or grouping controls. Runtime validation
also identifies conflicting fields so non-schema callers cannot bypass the rule.
Native schema rejection is displayed as actionable parameter feedback.

For source trend only, group_columns explicitly enumerates entity/dimension columns
and time_order=ascending explicitly requests chronological sorting. The server
partitions every observed group, validates every partition, and returns a separate
receipt for each group. It does not allow model-supplied group_values at the tool
boundary. Each receipt retains its group key, original row locations, ordering and
observation count. All groups must validate before receipts are saved. Missing
group keys/numbers, duplicate times within a group and invalid dates are rejected;
no observations are dropped, averaged or interpolated. The existing ungrouped
calculation path keeps its strict source-order behavior.

Computed grouped facts must include the receipt's exact selection_scope in their
statistical scope. Formal verification reconstructs the group and sorting from the
original evidence block and rechecks the result, receipt hash and selected scope.
A group cannot be presented as the whole population. Evidence hints report column
cardinality/observed values and whether time values are unique ascending,
descending or repeated/mixed, without choosing the analytical scope for the model.

## Bounded latency and compact computed narratives

Calculation returns retain only receipt metadata, the core result, units, method,
group scope, series count and receipt path. At most five group summaries are
returned per call; every validated group and observation is still persisted.
read_calculation_catalog paginates current-source receipts and verifies them from
source before reuse. read_calculation paginates series for inspection; the complete
receipt remains readable at its project-relative path. These are internal receipts,
not another model-authored handoff.

save_computed_facts accepts 1–3 model-authored narratives in Markdown. The template
contains summary and fact ID/title/type/description/analysis/context/importance,
confidence, relationships and calculation_id. Unknown numeric/evidence fields are
rejected. The server verifies the current receipt and inserts exact value, units,
complete series, source references, an actual evidence block and specification.
It renders the canonical Analyst Markdown, persists an immutable revision, and
runs the existing preflight. Full schema, references, evidence and deterministic
recomputation still run at formal submission. No quoted/inferred/forecast claim
is automatically generated. read_analysis_format provides their complete format.
Existing facts require local patching; append batches require the current revision
and cannot overwrite previous IDs. Narratives retain professional responsibility
for interpretation, scope, limitations, confidence and relationships.

Model metadata records request start, first/last nonempty stream delta, phase,
message-context characters and output characters; characters are not tokens and
input counts exclude the system prompt/tool schemas. Thinking content, streamed
text and tool arguments are never copied into these observation files. UI polling
shows waiting/text/tool-argument/processing/tool phases. Activity snapshots are
serialized and throttled, and are hidden after the stage stops or its attempt
changes. Native Pi sessions retain their existing trace storage independently.

DREAMATIC_MODEL_IDLE_TIMEOUT_MS defaults to 90000. Empty stream envelopes do not
refresh it. DREAMATIC_MODEL_CALL_TIMEOUT_MS defaults to 180000 and also bounds
continuous output; tool execution suspends both model clocks. Analyst additionally
uses DREAMATIC_ANALYST_PROGRESS_TIMEOUT_MS=240000 across model calls/tools. Only a
new persisted receipt or a changed saved draft resets that clock; repeated reads,
identical receipts and previously seen draft content do not. All values are
configurable initial limits, not measured optimal thresholds. Stage/run deadlines
and budgets remain outer bounds. Interruption aborts the current session and keeps
saved receipts/revisions; user continuation restores them without an automatic
paid model rerun. Recovering historical unsaved model text remains unsupported.

Performance observations include first saved fact from effective request time,
maximum model duration/context characters, total output characters, durable progress,
recovery and distinct timeout reasons. Compare identical inputs, model settings and
quality requirements before making real-provider speedup claims.

## Computed narrative repair

Duplicate append diagnostics identify the rejected fact ID, current revision and
recovery actions; blank IDs and duplicates within a batch have separate messages.
Rejected batches do not replace the saved draft. Read the existing fact before
retrying: an already saved fact can proceed to submission without another append.
`patch_computed_fact` accepts revision, fact_id and one compact narrative using the
same template as save_computed_facts. It requires an existing computed fact and a
matching ID, rechecks the receipt, fills server-owned fields and preserves every
other fact and the report summary. Full fact repairs retain patch_analysis_fact.
The durable-progress timeout remains independent and unchanged.
