# Dreamatic · Info — Project master specification

## Product purpose

Dreamatic Info turns a natural-language Brief into accurate, coherent and visually expressive information design: collect material, analyze it, extract facts and relationships, select content, design the whole composition and implement a finished artifact. Data Facts are the core information asset; storytelling is one method, not a mandatory structure for explanations or processes.

Support uploaded CSV, Excel, PDF and Word material and actual public-source research when needed. Preserve originals, source metadata, missing data, conflicts, definitions and uncertainty. Never fabricate sources or data to satisfy a design.

## Required architecture

Use public Pi SDK provider/session/tool/Skill contracts. Verify the stable release and public APIs before upgrading; reuse mature dependencies and never copy runtime internals. The adopted version is Pi 1.4.0.

Exactly five professional roles have independent provider, model, endpoint, credential and thinking configuration:

| Role | Responsibility | Formal output |
| --- | --- | --- |
| ChatBot | Requirements, reasonable defaults and necessary clarification | intent.md |
| Researcher | Source collection, datasets, definitions and limitations | research.md |
| Analyst | Reproducible analysis, statistical facts and qualitative structures | datafacts.md |
| Designer | Content selection, art direction, composition, mappings, commissions and visual review | design.md |
| Builder | Assets, code, composition implementation and implementation repairs | delivery.md and self-contained HTML |

Orchestrator is deterministic code, not a sixth agent. It owns dependencies, transitions, concurrency, commits, cancellation, budgets, retries, recovery and explicit repair routing. It does not perform professional judgment or creative work. Respect real dependencies; do not start professional work before its inputs exist.

Reuse DreamaticWeb / Dreamatic UI tokens, layout conventions and suitable components. Adjacent repositories are references only: never read their credentials or runtime user material. Runtime project data belongs under ignored workspace/. Deterministic fixtures exist only under tests/ and must never be server dependencies or product projects.

## Requirements and research

ChatBot identifies communication goal, audience, setting, content scope, medium, dimensions, interaction, brand and asset restrictions. Read the complete Brief and existing answers. Ask only when a missing answer blocks execution; otherwise record justified defaults.

Researcher reads uploaded normalized material and uses actual search/fetch tools when needed. Save a research plan, priorities, keyword queue and stopping conditions. Retain source ID, original URL, publication/access dates, file, fields, provenance and limitations. Unknown publication dates remain null. Distinguish primary statistics, background material, research opinion and speculation. Accepted body extraction is not proof of authority or relevance. Record external-asset usage conditions.

## Facts and structures

Analyst cleans and organizes real material, recording necessary transformations. Preserve unique IDs, descriptions, core values/units, evidence/locations, analysis, context, source_ids, importance, confidence rationale and relationships. Relation basis must be explicit. Correlation is not causation; causal statements require causal evidence. Model confidence is not a statistical confidence interval.

Statistical type is independent of derivation (quoted/computed/inferred/forecast). Required specification records scope, measure, breakdown, focus, method, aggregation, distribution_kind, series_unit and calculation_id. Computed results must bind a real source-table receipt and survive independent recomputation. Do not substitute model-authored arrays for source evidence. Keep exact core values; display rounding belongs in prose.

Support the ten statistical types and complete timeline/process/hierarchy/scatter contracts described in [DATA_FACT_TYPES.md](DATA_FACT_TYPES.md). Events, nodes, edges and paired observations carry direct source evidence. Do not manufacture quantitative values for qualitative material. Maps, networks and Sankey diagrams remain unsupported until their full data and validation contracts exist.

## Information design

Keep three independent dimensions: content task, reading mode and medium. Tasks include statistical overview, comparison/ranking, temporal evolution, process/decision, hierarchy, geography, relationships, explanation and guide. Reading may be guided, exploratory or hybrid. Medium may be poster, responsive page, interactive page or scrollytelling. Justify the main classification; combinations are allowed and not every task is supported automatically.

Designer first establishes the whole composition, then details components:

1. Communication goal, core message, factual selection, sections, hierarchy, reading order and relationships.
2. Theme imagery, color roles, font hierarchy, line/shape language, illustration style, background, decorative density and focus.
3. Grid, hero, text/chart/source regions, whitespace, grouping, alignment, proximity, anchoring, avoidance, layering and cropping.
4. Asset commissions, data mappings, component dependencies, interactions/animation, responsive reflow, print strategy and acceptance.

Use the smallest sufficient fields; do not duplicate reliably derivable information. Posters may use coordinates. Responsive media require explicit reflow rather than universal absolute positioning. Protect text, key values, labels and sources with safe regions and declare intentional overlap. Decoration must respect information hierarchy, contrast and density. Connect emphasis colors to the corresponding values/marks; keep explanations and sources near their content. Mobile may hide optional decoration but must retain essential explanation. Print must express necessary interactions statically.

Technical Skills cover selection, encoding, composition, assets, interaction/print, quality and structural types. Artistic Skills are independent and composable. Discover/load through native Pi mechanisms on demand instead of injecting every body into prompts.

## Assets and implementation

Every work has a background plan, without requiring generated imagery. Prefer CSS/SVG for flat color, gradients, panels, borders and simple geometry; use a consistent vector icon system. Informational connections bind actual structure. Generate thematic illustrations, complex scenes or special textures only as needed. Render text, values, units, legends, charts and sources in code, not baked into images.

Distinguish decoration, explanatory diagrams and precise data encoding. Factual diagrams need evidence; label non-scale imagery. Style must not imply unsupported proportions or causation. Commissions specify purpose, semantics, related content, dimensions/aspect, style/palette, subject position, text whitespace, transparency, positioning/crop, layering, factual boundaries, acceptance and fallback. Identify/version assets and their uses, reuse valid resources and avoid unused generation. Failed assets use the designed substitute; inability to preserve essential information must be disclosed and cannot be labeled complete delivery.

Builder follows official facts, core content and art direction. Use accurate D3/SVG/CSS/JS and accessible labels, keyboard behavior and reduced-motion support. Self-contained HTML, isolated preview and offline PDF must not require CDNs or remote runtime resources. PDF is on demand, outside the first-delivery critical path.

## Handoff, storage and recovery

Markdown is the sole model-authored handoff; the program parses and validates internal indexes. Use only infographic-markdown-2026, with no migration, dual reader or old fallback. Retain original Markdown with indexes and notes. Models do not maintain a second JSON report. Original sources → evidence → facts/structures → design → assets/components → work remain traceable.

Use isolated project directories and immutable artifact/draft versions. Write a complete version before atomically switching the checkpoint, then materialize canonical files. Persist status, role/stage, completed/pending work, attempts, inputs/outputs, timestamps, errors and recovery context. States are pending/running/completed/failed/interrupted. Recovery verifies fingerprints, content, schemas and references, skips unaffected completed work and resumes at the first invalid dependency. Upstream changes invalidate only necessary downstream work. Retries are bounded and must not duplicate delivery.

Models cannot overwrite arbitrary upstream files or execute shell commands. Controlled tools provide scoped reads and validated writes. Runtime configuration is project-local .env, never committed secrets or user data.

## Quality and performance

Program checks cover resources, console errors, overflow, bounds, detectable overlap/occlusion, mobile behavior and print diagnostics. Visual review covers hierarchy, reading path, associations, style, background interference, decoration, whitespace, illustration suitability and design fidelity. Program checks do not prove beauty, and visual models do not replace data validation. Check image-input capability and disclose unsupported review.

Default to one selected design, one rendered sample review and final-delivery review; use explicit issue ownership and bounded local repair. Builder owns implementation, Designer owns composition/assets, upstream roles own factual/source problems. Preserve issues, fixes, versions and timings; avoid free-form negotiation loops. Major composition changes may require full review. Current diagnostic limits are documented separately rather than claimed as complete.

Measure true wall time from valid user input to first viewable preview and final checked delivery, with PDF measured independently. Keep waiting/pauses, model/search/assets/checks/retries/repairs visible. Record stage time, model calls, context scale and tool time before prioritizing optimization. Use bounded independent work, overlap assets with implementation only after official design, and bind caches to content/version/configuration. Share end-to-end deadlines, cancellation and retry/repair counts. Reduce optional exploration/decoration when budgets shrink, never factual, citation or basic-usability checks. Compare real runs using identical inputs, configurations and quality standards.

## UI and engineering workflow

Provide conversation/clarification/upload, fact cards and relationships, role progress and artifacts, source/design workbenches, isolated preview and HTML/PDF delivery. Reuse established tokens and interaction patterns. Show saved intermediate results rather than inferred model thoughts. Support pause/continue and precise reruns.

Before modifying code, inspect instructions, product/architecture/protocol docs, current diffs and relevant implementations; publish a module/protocol-level plan. Preserve unrelated work and integrate related edits. Implement in dependency order: baseline/observation → contracts/roles/Skills → parsing/evidence/recovery → design/assets → rendering/review/repair → workbench/performance → cleanup/docs/acceptance. Revise the plan before important changes in direction.

Run check, relevant tests and production build after meaningful changes. Cover roundtrip/reference/recovery, source calculations, structural semantics and rejection, assets/fallbacks, desktop/mobile/print/offline behavior, HTML/PDF consistency, concurrency/cache invalidation/cancellation/timeouts/budgets. Keep at least statistical, illustrated explanatory and timeline/process fixtures under tests/. Never clear runtime directories implicitly through startup or tests. Before authorized cleanup, identify the actual project-only scope; preserve credentials, configuration, original user material and neighboring repositories.

Report implementation, removed paths, supported/unsupported capabilities, checks, browser verification and real-provider limitations honestly. Fixture success is not real generation-quality or performance evidence. See [Implementation](INFOGRAPHIC_IMPLEMENTATION.md), [Architecture](ARCHITECTURE.md), [Protocol](MARKDOWN_PROTOCOL.md), [Plan](REFACTOR_PLAN.md) and [Validation](VALIDATION.md) for current details.

The executable editorial/visual contract, baseline and review boundaries are
specified in [VISUAL_DESIGN.md](VISUAL_DESIGN.md). Designer must record the core
message, information hierarchy, primary visual, typography, background treatment,
decorative language and concrete visual self-review before formal submission.

Public research uses dedicated official APIs and provenance-checked repositories
before supplemental web discovery. Plans bind registered source IDs. Inspect
metadata before retrieving selected files or bounded geography/year slices;
register original responses, versions, licenses, transformations and full selected
data. Every planned question must bind evidence or disclose a specific gap before
submission. General web search requires an explicit purpose/reason and never
silently replaces a failed connector. See [acquisition plan](DATA_ACQUISITION_PLAN.md).
