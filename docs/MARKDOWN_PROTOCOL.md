# Formal Markdown handoff protocol

Version: infographic-markdown-2026. The Markdown handoff was introduced 2026-10-30 and the current infographic contract adopted during the 2026-11-01 refactor.

## Authored documents and internal data

ChatBot, Researcher, Analyst, Designer and Builder author Markdown. Orchestrator is deterministic. Programs compile internal indexes; models never maintain a second JSON report. Pi tools and HTTP retain native JSON parameter envelopes containing Markdown text.

| Role | Document | Required information |
| --- | --- | --- |
| ChatBot | intent.md | Title/topic/objective/audience/scope/data needs/content direction/preferences/constraints |
| Researcher | research.md | Summary, source/dataset IDs/paths/fields, URLs/dates/kinds/limitations |
| Analyst | datafacts.md | Types/derivation/specification, values/units, evidence/location, analysis/context, sources, importance, relations, confidence and complete series/structure |
| Designer | design.md | Overall rationale, ordered content/selection reasons, references, whole composition, page/palette/font, components/parents/sections, layout/mappings/interaction/animation/assets |
| Builder | delivery.md and output/index.html | Summary/limitations and independent HTML |

## Template syntax

Use the supplied localized template or accepted English business field names. Object scalar fields use a two-column field/value table; nested objects/lists use sections. Required sections cannot be silently omitted. Headings, field rows and record columns may be reordered. Empty strings may be blank or two backticks. Empty lists use the runtime template's localized none marker (Unicode U+65E0); reference-ID lists also accept its single bullet-item form. Never mix the none marker with real IDs. Missing nullable values use the template marker U+672A U+63D0 U+4F9B. These protocol literals remain unchanged by repository-document translation.

Complex record lists use the template's numbered item heading; simple scalar records use tables, such as label/value or source_id/quote/location. Preserve empty evidence, relations and series sections. A schematic field table is:

```markdown
| field | value |
| --- | --- |
| title | Population structure |
| objective | Explain the change using traceable statistics |
```

This snippet illustrates syntax, not a complete submit-ready document. Obtain the actual role template from documentInstructions/documentTemplate.

Escape cell pipes with backslash or supported entities and represent newlines with <br>. Program rendering escapes special characters for lossless evidence/series roundtrips. Numeric cells contain finite numbers without units; units have separate fields. Wrap numeric text such as 001 in backticks to preserve string type. Ordinary free prose belongs under the supplied final notes heading (Unicode U+8BF4 U+660E), which may contain arbitrary Markdown.

Standalone thematic breaks (---, ***, ___) are ignored structurally but preserved in original text. The same characters in cells/list items remain data. Do not wrap the entire document in a code fence. Parsing is template-based, not arbitrary natural-language extraction; enums, references and chart semantics remain strict.

## Tools, validation and failure budgets

read_handoff({document}) reads only allowed upstream reports or the full accumulated brief.md. Read complete relevant inputs; a manifest/summary is not a substitute. submit_stage({markdown}) parses and checks schema, source/fact/component references and actual quotations before ending the stage for deterministic commit.

Builder calls save_html({html}) first, staging validated self-contained HTML in memory, then submits its delivery Markdown. Failed submission does not rewrite the official work. There is no arbitrary path write or shell access.

Analyst/Designer may use saved draft_revision instead of resending Markdown. Analyst supports read/save/per-fact patch; Designer supports read/save/story/component patch and exact reorder. Updates require current revisions and preserve other original text. Preflight with pending issues is a successful save, not formal failure. Final submission always fully validates.

Formal failure, invalid draft-tool arguments and repeated stagnation have separate windows. Useful progress resets consecutive counters; default repeated/continuous limits are 3/5, configured through DREAMATIC_MAX_REPEATED_SUBMISSIONS and DREAMATIC_MAX_INVALID_SUBMISSIONS. Pi argument rejection before execution counts too. Stage/run/network budgets remain authoritative. Do not use ask_question to transfer technical errors to users. Starts, failures, checks and retries enter the event stream/log.

## Versions and recovery

Internal artifact.json stores original Markdown, protocol, compiled data and notes. Immutable version directories separately retain Markdown. The artifact digest covers author text and index. Canonical directories materialize Markdown/HTML only, without report JSON copies/downloads. Checkpoints refer only to complete written versions; interrupted work retains the last complete stage.

Current protocol/original documents are mandatory. Inputs, configuration or official file changes use one fingerprint/invalidation path. Missing/corrupt/old protocols are rejected, never converted. PUT /api/projects/:id/artifact/:role accepts only {markdown}; Builder uses the workflow. Configuration reads current .env keys without old aliases/migration.

## Statistical and structural contracts

Ten statistical types keep derivation separate and require specification and source-bound receipts for computed results. See DATA_FACT_TYPES.md. Program calculation records are not a second authored document.

Design requires composition (task, reading, medium, selection_basis, communication, art_direction, layout_rules, safe_regions, responsive_rules, print_rules, acceptance), component asset_ids and complete commissions. Responsive reflow need not use absolute coordinates. Nested assets use item sections; no old optional-extension reader exists.

timeline/process/hierarchy/scatter require structure; statistical facts omit it. Structure has events, nodes, edges and observations plus x_variable/x_unit/y_variable/y_unit. Unused lists are empty and nonscatter variables blank. Each record directly carries source_id/quote/location, not a nested evidence list. Events have id/date/label, nodes id/label, edges from/to/label, observations id/x/y. Dates use YYYY[-MM[-DD]]. Structural mappings reference one same-type fact and use structure for both fields with an empty unit. See the structured-visualization Skill.

Designer visual review submits a separate Markdown table with ID, owner, component and issue. Owners are researcher/analyst/designer/builder; component is an official ID or the runtime global marker U+6574 U+4F53. No issues uses U+65E0 U+95EE U+9898. The program compiles findings and routes bounded repair. Undeclared vision is unsupported, not passed. These runtime literals remain unchanged.

## Verification boundary

Local deterministic providers and temporary projects verify parsing/escaping, evidence, values, drafts, failure limits, recovery, source reads and independent HTML submission. They do not prove live-model template adherence, artistic quality or latency. See VALIDATION.md.

The composition table additionally requires core_message (核心信息),
information_hierarchy (信息层级), primary_visual (主题视觉), typography (字体系统),
background_treatment (背景系统), decoration_rules (装饰系统) and
visual_acceptance (视觉自检). They are executable free-text design decisions;
missing fields are rejected, never inferred from an older design. Empty asset
lists remain valid. See VISUAL_DESIGN.md for responsibilities and review limits.

All ID reference lists, including asset_ids and commission.content_ids, accept a
standalone none marker or a single bullet containing that marker. Mixed markers
and real IDs are rejected. Free-text lists retain their literal values. Asset
commission.content_ids contains fact IDs, not component IDs; component.asset_ids
expresses placement/use, and placement prose specifies anchors and cropping.

HTML fact traceability markers accept one complete fact ID or whitespace-separated
complete IDs in data-fact-id for multi-fact components. Validation reads static
markup without executing scripts; JavaScript source strings do not establish
coverage. Only facts selected by official components are required. Substring and
comma-separated matches are not accepted. save_html rejection does not stage HTML.

For ready commissioned images Builder writes an img with data-asset-id and alt
text. The server embeds its official data URL during HTML staging. generate_image
returns status/metadata only, never Base64 text. Generated-image bytes are omitted
from output/index.html model reads and restored by staging; unmarked author images
are not stripped. Failed commissions still require their designed fallback marker.

Visual review retains the four-column issue table. Its separator row may be
omitted, but no data row may be discarded. Asset IDs resolve to the component
using them. On subsequent reviews, list closed previous IDs as `- ID` under
`## 已解决`, omitting that section when empty. Under `## 待修问题`, provide the
remaining table or the existing no-issues literal. Every previously open issue
must be explicitly closed or retained with its ID; closed IDs cannot be recycled.
No second model-authored JSON review is introduced; the ledger is compiled state.

## Constraint origin and implementation decisions

Intent requires visual_constraints records: requirement, origin
(user/reference/brand/default), and basis. No reader invents a missing origin.
Defaults remain revisable. Design asset implementation is css/svg/generated_image,
independent of commission.semantics. Existing component.asset_ids and commission
placement/crop/layering/safe_regions form the usage contract. There is no parallel
model-authored asset report. Source-image issue targets should use the asset ID;
component presentation issues should use component IDs. Compiled issues retain
concept/asset/implementation/data categories alongside owner and stable ID.

Builder's save_visual_sample accepts real HTML and completed_components. Every
other official region has a visible data-unimplemented=ID label. It is a milestone,
not a formal delivery: no fabricated filler, completed heading and representative
fact region, offline code, real fonts/background/assets. Final HTML rejects all
unfinished markers and retains full component/fact/resource checks.

## Source-first research protocol

Search-plan target cells use exact connector IDs: pubmed, kaggle, worldbank, who,
eurostat, unsdg, zenodo, nbs, web. Same keywords on different connectors are
separate tasks. Before submission, `save_research_coverage` accepts a Markdown
table with localized headers `任务 | 来源编号 | 缺口说明`. Each planned task binds
actual current source IDs (comma separated) and `无` for complete coverage,
source IDs plus a remaining gap for partial coverage, or `无` for sources and
a specific gap of at least ten characters for missing coverage. Empty upload-only queues
need no coverage rows. These records are authored Markdown, compiled into internal
progress, never a second model-authored JSON report.

Source catalog metadata is not dataset evidence. Dataset paths must equal the
associated normalized source path; network datasets require a registered acquisition
receipt with intact raw/catalog/material digests. Reports preserve registered
acquisition source metadata and limitations. Numbered spreadsheet calculations may
explicitly set `first_row_header=true`; receipts retain that transformation and
recomputation validates every remaining observation.


## Research narrative composition

compose_research_report accepts Markdown with 概要 prose, 采用来源 source-ID bullet
list, 局限 bullet list (or 无), and optional 说明 notes. It inserts server-owned
registered source metadata and dataset records into the formal research.md schema,
merges saved gaps and source limitations, and saves an immutable draft revision.
Researcher submits that draft_revision without retranscribing metadata. Input and
content fingerprints plus source integrity are checked again on submission.
Manual formal Markdown remains supported for explicit artifact editing; no second
model-authored business report is introduced.

Supplemental search associations are explicit related_task_ids. Candidate IDs
are deterministic server-owned references, not model-authored observations.

Grouped source trend results return one existing calculation Markdown report per
observed group. calculation_id remains scalar per fact. Each grouped fact copies
its receipt selection_scope into specification.scope alongside the E- evidence
block ID; group keys and sorting are recorded in server-owned calculation receipts,
not a second model-authored artifact. Separate groups are separate facts/series.

Computed Analyst narratives may be appended using save_computed_facts: the small
Markdown input contains a summary and 1–3 facts with ID, title, type, description,
analysis, context, importance, confidence, relationships and calculation_id. The
server inserts verified receipt fields and real evidence into the same canonical
Analyst Markdown, rather than asking the model to copy numbers and entire series.
The standard complete report protocol and final validation remain unchanged.

Builder HTML validation returns aggregate resource, component and fact-marker
issues separately from Markdown handoff validation. save_html persists rejected
bounded content as an input-scoped repair draft. read_html_draft restores it;
patch_html repairs it without requiring an existing formal output file. A newer
rejected edit clears the accepted delivery slot. No rejected HTML can bypass
actual sample, render, resource or factual checks at formal submission. Progress
and repeated failure signatures exclude changing revision IDs.
