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
