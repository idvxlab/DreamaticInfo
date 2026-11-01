# End-to-end refactor plan and implementation status

Date: 2026-11-01. Inspection findings and a nine-part plan were published before implementation. The initial working tree was clean. This document distinguishes planned goals from implemented behavior.

## Inspection and target boundaries

The initial path used five serial independent Pi sessions submitting Markdown. Immutable store checkpoints, provenance/evidence views, source-bound calculations, network/file isolation, upload normalization and offline D3 packaging were retained.

| Module | Initial issue | Change |
| --- | --- | --- |
| shared/types and design schema | Optional whole composition/commissions | Required current-contract fields, no old reader |
| orchestrator | Timeout restarted per retry | Shared stage and run execution budgets |
| pi | Tools, assets and submission concentrated together | Extract delivery quality and asset service |
| render-check | Optional diagnostics only | Basic usability gates with advisory geometry |
| run-metrics | Creation-time origin and incomplete model observation | Valid-user-message origin, timings and context scale |
| Data/workbench | Missing structural contracts | Full timeline/process/hierarchy/scatter paths |
| Initial research docs | Stale product-demo description | Remove obsolete behavior |

Only ChatBot, Researcher, Analyst, Designer and Builder have model configuration. Orchestrator handles deterministic dependencies, budgets, cancellation, commits, recovery and explicit repairs. Do not parallelize professional tasks without their real inputs.

Markdown is the only authored report, compiled under infographic-markdown-2026 without fallback. Preserve source → evidence → fact/structure → design section → component/asset → HTML IDs. Keep field/value tables, record sections, lists and final notes. Asset execution receives official commissions/configuration and produces content-addressed ready/fallback outcomes and usage relationships; it cannot redesign the work.

## Data, roles and visual workflow

intent records task, goal, audience, scope, medium/dimensions, interaction, brand and asset constraints. research retains source/dataset metadata, definitions, missing/conflicting data and external-use conditions. datafacts separates statistical type, derivation, specification, receipts and evidence; structural records represent real events/dates, nodes/edges and paired observations with variable units. Never synthesize these through series.label.

design records independent task/reading/medium classification, communication, art direction, composition/safe regions, responsive/print rules, acceptance, mappings and commissions. Coordinates are reference geometry; responsive rules control reflow. delivery contains the single selected design, limitations and self-contained HTML; PDF is on demand. Maps/networks/Sankey remain unsupported.

ChatBot owns valid requirements, Researcher sources, Analyst calculations/structures, Designer art/composition/commissions/review and Builder assets/code/implementation repairs. Native Skills are split into selection, encoding, composition, assets, interaction/print, quality and structural visualization; artistic methods combine independently. Load only necessary bodies. Check image capability rather than assuming vision.

## Dependency-ordered work and acceptance

1. Baseline/observation: append events, distinguish input origin, model/tools, preview/delivery/PDF and waits; do not record prompts or credentials.
2. Contracts/control: one protocol, required design/commissions, cross-retry deadlines, cancellation and invalid-field/old-version rejection.
3. Structures: Schema, Markdown, evidence, mappings, validation, guide, UI and tests together. Reject bad dates, unknown nodes, cyclic hierarchy, missing units and incomplete pairs.
4. Composition/assets: whole layout first, bounded overlap, versioned content cache, usage validation and explicit substitutes. Configuration/commission changes invalidate cache; do not lose essential information.
5. Quality: isolated three-media rendering, one Designer screenshot review and owner-based bounded repair; persist issue IDs, owner, revision and time.
6. Workbench/performance: structure views, precise diagnostics, true wall/wait observations and content caches; compare identical real inputs/settings/standards.
7. Cleanup/acceptance: replace obsolete paths/docs/tests, retain three fixture classes only under tests, run check/tests/build and actual browser verification.

## Implemented and remaining limits

Implemented required composition/asset fields, unique protocol, shared run/stage deadlines, basic delivery gates and bounded report cache, valid-user-message wall origin, model/context observations and first-preview events. Pi's registry confirmed stable 1.4.0; no upgrade or runtime copying occurred.

Implemented structural contracts, per-record evidence/source-table extraction, dedicated mappings and accessible workbench rendering; overlapping asset generation, ready/fallback caches and HTML-use validation; centralized counts; native Designer screenshot review, explicit owner routing and persisted bounded repair; three offline browser/PDF fixtures; performance projection, file-digest and PDF caches. Removed the old inline Pi asset path and imageCacheKey function/test.

Remaining limits: arbitrary occlusion/transparent contrast/print clipping are not fully proven; repairs still batch all three media rather than cropped regions; interrupted waiting does not separately aggregate user pause versus shutdown. PDF regression checks essential text, not every graphic. Live model/search/image and actual visual-review quality remain untested, with no real end-to-end comparison.

Resume creates a new run budget but retains historical waits. context_characters is serialized message length, not tokens; duration_ms measures SDK intervals rather than pure inference. First preview is a basic-checked committed artifact, not an unchecked draft.

## Cleanup and validation history

No runtime directory was deleted. The actual root was verified read-only as `/Users/nancao/Projects/DreamaticInfo/workspace/projects`: zero active UUID directories, only .trash. Recycle contents, credentials, configuration and originals were untouched; startup/tests never implicitly clear product data. Dreamatic's adjacent path was unavailable; DreamaticWeb's warm-gray/orange/lime tokens were checked without reading credentials or runtime material.

| Checkpoint | Tests | Suite duration |
| --- | --- | --- |
| Initial baseline | 137/137 | 25.596 s |
| Contract/budget foundation | 139/139 | 25.920 s |
| Structural/assets/review acceptance | 145/145 | 29.291 s |
| Old-cache cleanup | 144/144 | 29.076 s |

check, production build and diff checks passed. Counts/coverage changed, so these are not end-to-end speed comparisons. Browser regression includes desktop/mobile/print, offline D3 and valid PDF. Real provider quality/performance is unverified. See [Implementation](INFOGRAPHIC_IMPLEMENTATION.md) and [Validation](VALIDATION.md).
