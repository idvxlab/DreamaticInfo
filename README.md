# Dreamatic · Info

A local information-design workbench built on Pi Harness 1.4.0. Five independently configured roles exchange requirements, research, facts and design through Markdown, then deliver self-contained HTML and on-demand PDF. The interface reuses Dreamatic Web / Art design tokens and workbench interactions.

## Start

Requires Node.js >=22.19. Node 24+ is recommended; the project has been verified on Node 25.6.1.

```sh
npm install
npm run dev
```

Open [the workbench](http://127.0.0.1:5175); the API listens on port 4315. Creating a project immediately saves an empty draft. Model execution starts only after a valid requirement is sent.

## Configuration

Use Model and Settings for live projects. Runtime configuration is stored in the project-root `.env`; first startup fills missing defaults. Alternatively edit `.env.example` values into `.env` and restart. Settings follows Art's four-module dialog, two-column forms, segmented tabs and advanced options:

- Search: auto/Bing/DuckDuckGo/Brave/Serper, independent key, result count and network timeout.
- Reasoning: native Pi providers or OpenAI-compatible/Responses, custom endpoint and key, default model and independent provider/model/endpoint/key/thinking-level overrides for all five roles.
- Images: OpenAI-compatible request fields through Pi's public image provider contract, including endpoint, model, key, dimensions, response format and limits.
- System: API/development ports, workspace, PDF browser, upload/fetch limits, stage/run budgets, retries and additional Skill paths.

Blank secret inputs retain existing values; the API exposes only whether secrets are configured. Saving validates and atomically updates `.env`, preserving comments and unrelated keys. Model, search, image and limit changes apply to subsequent tasks; ports and workspace require restart. Startup reads current project configuration, not global Pi authentication files. Different native providers need their own credentials.

The reasoning panel shows each role's effective connection and whether it inherits defaults. Reset a role to defaults if it retains an unwanted override; independent keys remain. The default `openai/gpt-5.4` does not imply authentication. For custom models outside Pi's catalog, configure actual context/output limits and reasoning capability.

## Inputs and export

Upload CSV, TSV, XLSX, PDF, DOCX, TXT, Markdown or JSON; the default per-file limit is 25 MB. Convert legacy binary XLS/DOC first and OCR scanned PDFs. Without uploads, Researcher searches and fetches real sources. Auto search prefers configured Brave, otherwise Bing RSS followed by DuckDuckGo. Network/source failures are disclosed rather than replaced with invented data. Download remote binary PDF/Office material before uploading it.

PDF uses local Chrome/Edge/Chromium or Playwright Chromium. Configure `DREAMATIC_CHROME_PATH`, or run `npx playwright install chromium`. It prints the same HTML with external requests blocked, fonts/images ready and animation disabled. Export errors retain HTML. PDF is on demand and cached by artifact/configuration digest.

## Workflow

1. Select or create a project; describe topic, audience, scope and preferences and attach files if needed.
2. ChatBot forms a Brief, asking only necessary questions.
3. Researcher saves its plan/keyword queue and reads real sources; Analyst extracts facts/structures; Designer establishes content, art direction, composition and mappings; Builder implements HTML while official assets generate through a bounded queue.
4. Inspect facts, narrative/design, sources and the work. Download HTML or request PDF.
5. Pause/continue or rerun a stage and its downstream dependencies. New requirements/data invalidate affected artifacts.

The product has exactly five professional roles. Orchestrator is deterministic scheduling code without a model or creative responsibility.

## Repository layout

- `apps/web`: React/Vite workbench.
- `apps/server/src`: API, import/network tools, Pi adapter, orchestration, storage, evidence validation, asset execution, visual review and export.
- `packages/shared`: types, role definitions and chart/structure semantics.
- `agents`: independent Markdown role prompts.
- `skills/technical`, `skills/artistic`: native, on-demand Pi Skills, including Picasso/Van Gogh/Monet methods; complete bodies are not injected together.
- `schemas`: core JSON Schemas for program-generated indexes and state.
- `.env`: runtime configuration; `.env.example`: complete secret-free reference; `config-store.ts`: metadata, validation and atomic persistence.
- `workspace/projects/<UUID>`: ignored original inputs, normalized sources, Markdown artifacts, internal indexes, immutable versions, state, sessions and output. Never commit credentials or user material.

## Project management

Without a selected project, input, suggestions, upload and send are disabled. Sending a message does not implicitly create a project. New Project saves a sidebar draft immediately; its first message starts that same project.

The project menu supports rename and delete. Names contain 1–120 characters. `project-display.json` stores the display name separately so model titles cannot overwrite it and renaming does not invalidate workflow inputs. Rename is allowed while running; pause before deleting.

Confirmed deletion renames the whole project directory into `.trash/` on the same filesystem. Originals, sessions, state and output remain recoverable. With tasks stopped, move the recycled directory back to its original project ID without overwriting another directory. The sidebar removes deleted projects, selects another if available and cancels their polling/subscriptions.

`DREAMATIC_WORKSPACE` defaults to `workspace/projects`; relative paths resolve from the repository root and absolute paths are supported. Changes require restart and never migrate data. Switching back restores visibility of the old directory's projects.

## Research and drafts

Sources shows saved plans, keyword tasks, candidates, usable bodies and diagnostics before research completes. Successful searches and bodies survive pause/retry. Ordinary web reading uses cookies, Readability and controlled Chromium when needed. PMC/PubMed use official interfaces and distinguish abstracts from open full text. Tables, links and source limitations remain traceable; challenge pages are diagnostics, not evidence.

Analyst supports stable evidence views, draft preflight, per-fact append/repair and recovery. Facts shows saved drafts with verified/pending counts and precise issues; source changes hide stale verification, and formal submission replaces the draft projection. Designer similarly saves narrative/design drafts with selection/order rationale and fact/evidence/component navigation. Only formal design becomes Builder input.

See [Research workbench](docs/RESEARCH_WORKBENCH.md), [Web reader](docs/WEB_READER.md), [Analyst workbench](docs/ANALYST_WORKBENCH.md) and [Designer workbench](docs/DESIGNER_WORKBENCH.md).

## Handoff and recovery

Models submit `submit_stage({markdown})`, not nested business JSON. The parser accepts the supplied localized headings/field tables or corresponding English field names. Markdown is the sole authored artifact; indexes/state are program-maintained JSON. Downstream roles read full `brief.md` and relevant handoffs; prompts carry a manifest and short summaries. Builder stages HTML separately before submitting its Markdown delivery report.

Formal submission errors, invalid draft arguments and draft stagnation have separate counters. Useful repairs reset consecutive-failure windows; defaults stop at three repetitions of one error/state or five consecutive failures/no-progress events. Settings exposes `DREAMATIC_MAX_REPEATED_SUBMISSIONS` and `DREAMATIC_MAX_INVALID_SUBMISSIONS`. Stage/run budgets still apply.

Commit writes an immutable version, atomically switches the checkpoint, then materializes canonical Markdown/HTML. Recovery verifies fingerprints, schemas, references, document/index digests and canonical files, continuing from the first invalid stage. Startup marks leftover running tasks interrupted. Direct edits to canonical files invalidate a stage; use `PUT /api/projects/:id/artifact/:role` with `{markdown}` for validated edits to chatbot/researcher/analyst/designer artifacts. Writes are exclusive per project; material/configuration changes are prohibited during active work.

See [Markdown protocol](docs/MARKDOWN_PROTOCOL.md) and [Architecture](docs/ARCHITECTURE.md).

## Visualization and quality

Ten statistical fact types distinguish type from quoted/computed/inferred/forecast derivation; source-bound computations retain reproducible receipts and separate metric/series units. Timeline, process, hierarchy and scatter use explicit source-linked structural records rather than invented numeric series. D3 7.9.0 renders chart geometry; saving HTML embeds the official library and license without a CDN.

Whole composition and asset commissions are mandatory. Basic offline desktop/mobile/print checks gate delivery. The existing Designer model performs screenshot review when image input is declared; otherwise the limitation is explicit. Findings route to their owning role with bounded, persisted repairs. These checks do not prove arbitrary visual mappings or aesthetic quality. Maps, networks and Sankey diagrams remain unsupported.

See [Fact types](docs/DATA_FACT_TYPES.md), [D3 integration](docs/D3_VISUALIZATION.md), [Implementation and limits](docs/INFOGRAPHIC_IMPLEMENTATION.md) and [Refactor plan](docs/REFACTOR_PLAN.md).

## Verification

```sh
npm run check
npm test
npm run build
# With the service running:
npm run test:smoke
```

Tests use native Pi against local deterministic providers and isolated temporary projects. They cover workflow/recovery, invalidation, evidence, import/export, network/path isolation, assets, structural semantics and browser checks. Smoke tests manage drafts and API boundaries without external models or product examples. Fixtures remain under `tests/` and are never imported by the server.

Passing tests does not verify live model quality, artistic Skill adherence, external image services or real end-to-end performance. See [Validation](docs/VALIDATION.md).

## Production

```sh
npm run build
npm start
```

Open [the local server](http://127.0.0.1:4315). This is a loopback-only single-user application with Host/Origin checks, not a multi-tenant service. Public deployment needs authentication, authorization, quotas and tenant isolation. A persistent-disk Node service is required; static hosting alone is insufficient. Start the API from the repository root.

If a compatible endpoint rejects developer messages, keep `DREAMATIC_SUPPORTS_DEVELOPER_ROLE=false`; Pi then sends instructions through system while reasoning capability stays independent. Enable it only when the endpoint supports it. Native Pi providers are unaffected by this custom-connection setting.

Additional references: [Project specification](docs/PROJECT_SPEC.md), [Initial research](docs/RESEARCH_AND_PLAN.md), [Configuration audit](docs/CONFIGURATION_AUDIT.md), [Conversation design](docs/CONVERSATION_DESIGN.md) and [Narrative UI](docs/NARRATIVE_UI_DESIGN.md).
