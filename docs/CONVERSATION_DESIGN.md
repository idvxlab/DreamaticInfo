# Conversation design investigation and implementation

Date: 2026-10-30. Historical references were Art AgentPanel.tsx, RunStatus.tsx, CompletionSummary.tsx and styles.css. Only design/code was inspected, without neighboring credentials or runtime data.

Art uses a fixed header/composer and independently scrolling middle, dark right-aligned user messages, light left-aligned assistant messages, role timelines and expandable execution cards. Tool progress, stage artifacts and file links have separate hierarchy. Clarification offers options/custom answers and completion provides delivery links. Enter sends, Shift+Enter inserts a line and IME composition never sends. Reading older messages preserves scroll.

Info previously stacked messages, all five fixed stages and logs separately, retained a permanent introduction and omitted artifact notes. The plan extracted Conversation, matched Art's scoped panel/bubbles/cards/clarification/attachments/composer, ordered actual activity chronologically and protected scroll/IME/narrow layouts while preserving scheduling contracts.

## Result

Conversation.tsx, conversation-model.ts and scoped conversation.css replace the old App implementation. Optional stage_results contains only committed summary/notes and disappears on invalidation. No new model calls or raw HTML/JSON tool payloads become ordinary dialogue.

Only started stages are displayed; active cards expand and completed cards collapse. Role events retain up to 200 current-subscription entries; committed results survive refresh, while live tool detail is not presented as durable history. Clarification supports options/custom answers, dismisses to normal input and does not reappear after an answer/completion. Running work retains pause. Without a project, suggestions/upload/input/send are disabled.

Completion statistics derive from real sources/facts/components and link to preview/HTML; PDF remains in the work area. Reliable token/time summaries were unavailable at that historical point, so Art's unsupported statistics were not copied. Current performance projection is documented separately. Narrow screens use a bounded scroll panel and fixed composer; reduced-motion preferences are respected.

## Historical verification

Four conversation/SSR tests and workflow assertions covered ordering, grouping, committed notes/links, escaping, stale questions, pause and no-project behavior. All 46 tests, TypeScript check and production build passed. Browser tooling reported disabled local browser use at this checkpoint, so desktop/narrow visual interaction was not verified then. No live external model/image service ran. See VALIDATION.md for subsequent checks.
