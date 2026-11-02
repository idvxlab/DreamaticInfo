---
name: asset-design
description: Commission optional illustrations and textures with factual boundaries and fallbacks.
---
Every work needs a background plan. Use CSS/SVG for flat colors, gradients and simple geometry and a consistent vector icon system. Generated images do not contain body text, numbers, legends or sources. Define purpose, semantics, factual references, dimensions, subject position, text whitespace, transparency, cropping, layering, factual boundaries, acceptance and fallback. Label non-scale diagrams. Generation failure must not remove necessary facts.

Plan the visual system before generation: background ground/texture/light, focal subject, typography, icon/line language and decorative purpose. Explicitly choose CSS, SVG, generated imagery or typography for each need. An empty generated-asset list is valid only with an executable alternative visual strategy. Commissions share palette/material/lighting language and bind the actual composition: subject scale, text-safe whitespace, anchor, crop and layer. Do not generate a whole infographic containing text/data. Licensed supplied fonts may be embedded; otherwise specify available system fallbacks. Asset failure is a disclosed loss of fidelity even when the substitute passes usability checks.

commission.content_ids contains official fact IDs only. Decorative assets may leave it empty. Component IDs do not belong here: components bind assets through component.asset_ids. For a local commission correction, read_design_draft(asset_id) and patch_design_asset preserve the rest of the design and avoid full-document regeneration.

## Explicit implementation routing

Select css, svg or generated_image for each element separately from decorative,
explanatory or data semantics. Only generated_image commissions enter the image
queue. Use existing component references and commission placement fields to bind
use. Builder saves inert SVG through versioned project tools, then checks its
actual background and size. Resource safety does not establish artistic success.
