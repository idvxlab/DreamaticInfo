# Editorial and visual design contract

## Baseline and purpose

The observed 2026-11-01 UAV delivery used four sections, eight metric cards,
four bar charts and one donut. Its background gradient, faint dot grid, small
silhouette and section rules were described in the official design and appeared
in HTML. No generated assets were commissioned. The recorded review requested
mobile reflow and subsequently accepted the result. This is evidence of limited
visual ambition in the formal plan, not an image-provider failure. Runtime
material remains in ignored workspace; it is not copied into test fixtures.

## Current workflow

Designer edits content before selecting a visual concept and whole composition,
then defines visual systems and commissions. The seven required composition
fields are core_message, information_hierarchy, primary_visual, typography,
background_treatment, decoration_rules and visual_acceptance. Existing fields
retain classification, general art direction, geometry, safe regions and media
adaptations. The Markdown protocol remains infographic-markdown-2026; no second
model-authored JSON, old-contract conversion or hidden defaults are introduced.
Schema changes affect existing fingerprints and draft scopes. Immutable history
is preserved; continuing an older project can invalidate Designer and Builder.

Visual acceptance is a concrete pre-submission self-review, not a numerical
beauty score or a claim to have inspected pixels. Program validation checks
required fields, references, units and geometry. It cannot verify whether prose
is insightful. Empty asset lists and typography-led layouts remain legitimate.
There is no mandatory image count, card-count rule or fixed aesthetic.

CSS/SVG serve simple treatments, generated images serve commissioned scenes or
textures, and code renders data/text. Existing commissions define safe whitespace,
scale, crop, layers, factual boundaries and substitutes. Fonts must be available
system faces or supplied licensed embedded files; no remote font service or
automatic unlicensed font download is introduced. Actual font fallback and
wrapping require screenshot review. Asset fallback is also recorded as a derived
summary/notes limitation, without rewriting the original authored Markdown.

## Review and bounded repair

The existing Designer screenshot task now judges both design adequacy and
implementation fidelity. An accurately implemented weak hierarchy or generic
composition belongs to Designer. Failure to implement the formal design belongs
to Builder. Findings must name a region/component, observation, reading impact
and bounded repair target. Existing owner routing, persisted repair counts and
two-repair maximum apply. Unsupported vision is disclosed rather than passed.
No additional professional role or compulsory second image-generation pass is
introduced. The production Builder now submits a rendered code sample before full delivery; see the sample gate below.

The workbench shows all seven decisions and explicitly labels the geometry view
as a layout schematic, not the final artistic result. Product chrome continues to
use existing Dreamatic tokens; generated work is governed by its own brief.

## Validation boundary

Contract tests cover Markdown roundtrip, missing visual fields and legitimate
empty assets. Routing tests cover Designer-owned composition repair retaining
Analyst work. Existing three-media fixtures cover statistical, illustrated and
structural delivery/offline/PDF mechanics. They do not demonstrate improved model
art direction. Live acceptance should rerun identical real inputs/settings and
compare editorial weights, subject specificity, hierarchy, type/material coherence,
fidelity, factual quality, time and asset cost. No live-provider aesthetic success
is claimed by this implementation.

## Convergent review repairs

Review carries forward versioned issue history. The model retains IDs for open
findings and explicitly closes resolved IDs in Markdown. New regressions receive
new IDs; optional styling demands must not expand the scope of local repair.
Original source images (up to four) are supplied through native vision alongside
screenshots, with bounded binary-free dimension/CSS diagnostics. A faint embedded
image is not missing merely because it is hard to see. Source-image suitability
belongs to Designer; presentation opacity, sizing and crop belong to Builder.
Visible axis ticks alone cannot establish the scale domain.

After two repairs, unresolved findings produce a separate needs_revision visual
acceptance result. Generation artifacts remain completed, viewable and exportable;
this is not visual success and does not silently reset repair budgets. The review
ledger preserves every round including the terminal findings. Unsupported review
does not close outstanding issues. No runtime project is automatically rewritten.

## Explicit execution and vector resources (2026-11-01)

The formal asset schema now requires implementation (css, svg, generated_image).
There is no old-reader default. Semantics remains independent; generated images
cannot encode precise data. Existing component.asset_ids and commission placement,
crop, layering and safe_regions are the usage contract. Queue start/get/settle all
route only generated_image. CSS and SVG commissions never call the image provider.

Builder save_svg validates inert standalone vectors and saves immutable versions
under assets/svg/<id>/<digest>.svg. read_svg restricts reads to that namespace and
checks project isolation. Required viewBox and pixel dimensions, resource limits,
external references, active elements and event attributes are checked. Builder
embeds returned markup inline. check_render remains necessary to inspect target
background, size and composition; SVG validation is not visual acceptance.

Stage fingerprints and Designer draft scopes now hash role prompts and discoverable
Skill Markdown bodies, including supporting Markdown. This conservatively
invalidates on any available Skill instruction change, not only a loaded Skill.
Historical drafts remain intact; older scopes are not reused automatically.

## Completed workflow wiring and verification boundary

Intent requires visual constraint provenance. Explicit continue/repair/redesign
operations preserve direction or open a new draft scope intentionally. Builder
must pass save_visual_sample before formal submission when production scheduling
provides the gate. Sample HTML, three-media screenshots and review Markdown are
immutable; final HTML rejects unfinished regions. Designer owns concept and source
imagery, Builder presentation. Repairs share the existing persisted allowance.

Image decode checks cover MIME/signature, byte/pixel limits, actual dimensions,
aspect, transparent pixels and alpha bounds. Fully transparent results fail.
Resource metadata and independent visual acceptance are exposed in the workbench.
Cache reuse never implies visual acceptance. SVG versions are server-embedded at
marked anchors and bound to the official asset/composition contract. The alpha
threshold is 8; these bounds never identify a photographic subject.

Live evidence is deliberately separate: the controlled 120-second/four-turn
proposal comparison used the same synthetic CSV and Designer configuration. The
baseline submitted, while current instructions timed out without formal submission.
The proposal harness exposes fewer tools than production, so this is a harness failure within its declared budget, not a valid end-to-end quality ranking. The baseline Builder render and separate image request also timed out; no successful paired screenshot comparison exists.
See VALIDATION.md and ignored workspace/verification outputs for actual outcomes.
