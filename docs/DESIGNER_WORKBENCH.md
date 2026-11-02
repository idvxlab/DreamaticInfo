# Designer and narrative workbench

Implemented 2026-10-31. The original UI only displayed final design and disconnected fact IDs; interrupted design had no recoverable intermediate output. The implementation adds explicit content/order rationale, immutable Markdown drafts, native tools and section/fact/evidence/component navigation while retaining five roles and deterministic scheduling.

## Contract

narrative_rationale explains the overall message, question and reading sequence. Each storyline item has rationale for selection/order. Components explicitly reference story_ids; any component facts must belong to the union of its linked sections. Global headings/decoration may have no section. At least one section and nonblank rationale are required. Current composition, mappings, references, units, parent cycles and reference geometry are validated. There is no old-field completion or conversion; JSON indexes are compiled from Markdown.

## Native tools

- read_design_draft reads current revision/issues/Markdown, optionally either story_id or component_id, never both.
- save_design_draft saves a draft with base_revision for updates. Save the whole composition/content plan before detail; empty unplanned lists follow the supplied empty-list marker. Pending preflight issues are ordinary successful saves.
- patch_design_story replaces/appends one full section item with current revision and story_id, preserving other text/notes and rejecting extra sections.
- patch_design_component does the same for a visual component. Component issues must not be routed through the story tool; wrong-tool errors explain the correct operation.
- reorder_design_stories requires an exact, unique complete ID list and cannot delete sections. Update rationale when order changes.
- submit_stage requires a saved visible Designer draft before official submission. Analyst/Designer may submit draft_revision; final validation is complete and Builder starts only after official design.

Useful parsing repairs, fewer issues or additional verified sections reset stagnation counters. Formal failures, invalid arguments and no-progress states are separate; stage/run deadlines remain authoritative.

## Persistence and API

state/drafts/designer/<scope>/revisions/<UUID>/ stores draft.md, validation.md and meta.json before atomically switching current.json. Scope binds requirements, intent, research, official facts, design schema and actual source digests. Read, edit and submit recheck source content.

Read-only polling endpoints are GET /api/projects/:id/design/progress, /design/draft?revision=<UUID> and /design/validation?revision=<UUID>; project detail also returns design_progress. Downloads only accept current scope/revision, with no arbitrary path. Changed requirements/facts/sources hide old drafts. Paused/failed drafts remain; formal completion hides draft projections and exposes official design.

## Workbench behavior

Reuse Web/Art paper, ink, lime, cards and fact components. Saved state is refreshed through existing 1.8-second polling/SSE without forcing tabs or pretending to reveal internal model thinking. Status derives from persisted narrative/visual lists and validation only.

The workbench shows whole-message rationale, section order, selection reasons, supporting facts and component mappings. Section selection updates facts, Analyst-supplied relationships and visuals. Fact inspection opens original quotation/location/source and can locate the fact tab. Relationship inspection shows both endpoints; shared selection does not imply causation. Unselected facts remain inspectable.

Views are narrative, visual plan and checks. Evidence uses an in-workbench dialog; geometry and implementation parameters expand on demand. User navigation, selection and scroll survive polling. Unparseable drafts retain document/check links; formal designs use the same navigation with an official-result marker. See [NARRATIVE_UI_DESIGN.md](NARRATIVE_UI_DESIGN.md).

## Local component repair and units

Diagnostics aggregate component ID/title, field, fact, actual and required units, relationships, mapping, series, parent cycle and layout issues. Story/component repair progress uses separate namespaces to avoid ID collisions. Locate Component switches section and reveals its issues only on explicit action, not polling.

Only reference-ID lists treat the supplied none marker or its single list-item form as empty; mixed real IDs/none are rejected. Free-text list entries retain literal content. Original Markdown is not rewritten.

A series explicitly declaring multiple units with commas/semicolons cannot map to one bar/line axis or donut, even when mapping.unit copies that mixed string. Metric uses verified core value/unit. Designer may use metrics/text to explain limits; multiple charts require Analyst to create evidence-backed homogeneous facts. Never guess conversions, remove observations or disguise units. Quotient/product units such as mg/dL and kg·m^-2 are not lists.

## Verification history and limits

Historical checkpoints passed 118 tests for drafts/API/native Pi, 123 after component/unit protection, and 126 after UI reorganization; check and production build passed. Isolated narrative-preview.mts uses temporary configuration/projects and Chromium to verify section/relationship/evidence navigation, updates, focus, component location, no scroll stealing, narrow layouts and official switching. Product imports no fixture executor.

External paid models and user projects were not run. Prompt requirements do not guarantee real save frequency or narrative quality, and program structure/reference checks cannot prove free-text reasoning. See [VALIDATION.md](VALIDATION.md) for current totals.

## Editorial and visual system

The whole-composition panel displays the seven required editorial/visual decisions
alongside existing layout/media rules. The geometry view is explicitly a layout
schematic, not a finished art preview. Visual self-review is model-authored design
reasoning; neither filled fields nor preflight success certify aesthetic quality.
See VISUAL_DESIGN.md for the baseline, visual contract and owner-based review.

## Scoped repair and progress

read_design_draft also accepts asset_id; patch_design_asset edits one complete
asset item with revision checking and preserves every other section and notes.
commission.content_ids references official facts only; component.asset_ids records
which components use an asset. Decorative commissions may have no fact IDs.
Assets participate in repair snapshots under their own namespace. Expanding a
narrative draft into visual components establishes a new issue baseline once;
phase toggling cannot reset the no-progress window. Designer feedback points to
component/asset tools instead of Analyst evidence instructions.

## Saved visual workflow

The visual workflow panel exposes constraint origins, explicit operation/reason,
local repair/redesign controls, immutable rendered-sample links and status, current
formal revision, asset technical metadata and acceptance/fallback. Its controlled
reason editor preserves local state when project polling updates props. The
geometry plan remains separately labelled as schematic. Unsupported image review
is displayed as unperformed. Final delivery cannot retain sample placeholders.

## Disjoint local edits and version conflicts

Each local item patch records its parent revision and target namespace/ID in the
immutable revision metadata. Multiple patches issued from one base revision can
merge only if every intervening revision is a local patch to a different target,
the requested target remains unchanged, and document-level decisions and notes
remain unchanged. The merged document receives normal parsing, reference checks
and preflight. Edits to the same target (including no-op edits and changed-back
content), whole-document saves, reorders, unknown versions and history without
patch metadata still require rereading the latest revision. No history is migrated.

Version-conflict feedback includes the current revision and targeted read action.
Unparseable drafts instead return their actual parser diagnostics and the current
base_revision for full-structure repair. These distinct conditions no longer share
an ambiguous error. Existing bounded failure and stagnation policies remain active.
