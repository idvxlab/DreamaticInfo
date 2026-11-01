# Technical research and initial implementation plan

Historical investigation: 2026-10-30. The current refactor status is [REFACTOR_PLAN.md](REFACTOR_PLAN.md).

## Pi Harness

The public npm registry reported @earendil-works/pi-coding-agent stable 1.4.0 and repository https://github.com/earendil-works/pi. Three Pi packages were pinned consistently at 1.4.0 and installed public declarations/source inspected. [Public SDK documentation](https://pi.dev/docs/latest/sdk).

Use createAgentSession, ModelRuntime, SessionManager, DefaultResourceLoader and ToolDefinition. Keep independent role sessions/models and deterministic business scheduling. Native Skill discovery, descriptions and on-demand reads provide professional knowledge. Follow installed API declarations rather than assuming old tools-array examples apply. Do not copy runtime internals.

## Reference projects

Historical inspection covered root instructions, package metadata, frontend source/styles, Web FactCard/QuestionCard and Pi Skill integration, without credentials/runtime data.

- DreamaticWeb: React 19, TypeScript, Vite 7, Express 5 and Pi 1.3.0 at inspection; functional components and expandable source/evidence cards.
- Dreamatic Art: React/TypeScript web/server workspaces and a three-pane project/canvas/conversation workbench. Its desktop shell is not directly transplanted.
- Shared tokens: dark sidebar #20211d, warm gray #e8e7e1, paper #f6f5f0, orange #d76942, lime #c9e46b; Segoe UI/PingFang/system fonts, fine borders, compact hierarchy, Lucide icons and restrained animation.

Reuse these tokens/interactions while implementing domain-specific components instead of coupling to adjacent business APIs. Both repositories are read-only references.

## Initial delivery order

Define schemas/interfaces; integrate Pi, workspace/import and five role tools; implement atomic state/fingerprints/retry/recovery; build React project/conversation/fact/source/design/preview/settings views; verify network, HTML/PDF and documentation.

Run npm install and npm run dev; web 5175 and API 4315 bind loopback. Production uses npm run build then npm start. Persistent disk and Node are required, not static/Worker hosting. Configuration is project-local. Startup without credentials is allowed but execution reports missing auth. There is no product demo runner; deterministic fixtures live only under tests and do not substitute for provider verification.
