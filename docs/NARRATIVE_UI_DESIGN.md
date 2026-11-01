# Narrative workbench UI reorganization

Date: 2026-10-31. Design investigation used the frontend-design guidance and retained Dreamatic Art/Web's established language. The original workbench stacked oversized status/counts, message blocks, directories, relationships, components, full fact cards and technical checks in a constrained central pane. Repetition overwhelmed the first screen; viewport width did not represent actual pane width.

## Plan and layout

Compress title/status/time/counts; provide narrative, visual plan and checks views; use section master/detail with compact facts and on-demand evidence; group components and collapse technical parameters; centralize filterable diagnostics with precise location. Preserve view/selection/scroll during updates and test real pane widths.

```text
Narrative and design | Draft                         Document
Design title / save status / compact counts
Narrative             Visual plan              Checks (2)
Overall rationale summary                            Expand
Section directory    Current section
01 ...               Conclusion and explanation
02 ...               Compact supporting facts
03 ...               Selection rationale / relations on demand
```

Retain #E8E7E1 background, #F6F5F0 paper, #20211D ink, #C9E46B lime and #D76942 warning. Use existing system/PingFang fonts, about 19px view titles, 18px section titles, 13px body and 10–12px supporting text. Lime denotes selection and orange issues. Remove duplicated big headings/count cards/unused styles. Left alignment and grouping establish hierarchy.

## Components and interaction

DesignWorkbench provides compact header, keyboard-switchable tabs, collapsed overall rationale, section master/detail and checks. DesignVisualPlan draws validated reference geometry as SVG and groups components by section. A component appears once in its default group while multiple associations remain available. Invalid dimensions/coordinates disable the map with a clear message. Details expand below the selected row; mappings/interactions default closed. Only explicit selection scrolls the map.

DesignEvidenceDrawer uses an in-workbench modal dialog with Escape and focus restoration, original evidence/sources, both relation endpoints, selected/unselected filters and cross-tab fact location. Reuse fact/data components with readable evidence contrast.

Container queries switch directories to a selector below 640px and visual plans to one column; the right conversation remains independent. Polling preserves view, selection, expansion and scroll; counts/status reflect saved data rather than fictional model thinking. Stale scopes stay hidden; malformed drafts retain document/check access. Backend validation and formal submission boundaries remain intact.

## Verification

The historical 126-test checkpoint passed strict TypeScript/build and UI tests for default views, evidence/check disclosure, stale/malformed drafts, escaping, invalid geometry and unique multi-section listing. The isolated narrative-preview.mts uses seven sections and 28 components with temporary projects and Chromium. It checks first-screen reading, endpoint/evidence dialog, Escape/focus, filters/location, component selection, polling stability, keyboard tabs, container layout, 390px dialog bounds and formal switching without page errors. Screenshots stay temporary and product code imports no fixtures. No paid external model or user project was executed.
