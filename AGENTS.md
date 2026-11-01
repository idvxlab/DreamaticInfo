# Dreamatic · Info development rules

Read docs/PROJECT_SPEC.md and docs/ARCHITECTURE.md for product contracts.

- Use public Pi SDK, native provider/session/tool/Skill contracts. Verify the current stable Pi release before upgrades; do not copy runtime internals.
- Keep exactly five professional roles with independent model config. The Orchestrator performs deterministic control only.
- Reuse DreamaticWeb / Dreamatic UI tokens. Adjacent repositories are references; do not read their credentials or runtime user data.
- Keep source material and evidence traceable. Product example/demo execution is removed. Deterministic fixtures belong only under tests/ and must never be imported by the server or exposed as product projects.
- Runtime project data belongs in ignored workspace/. Do not commit credentials or user material.
- Run check, relevant tests and production build after meaningful changes. Record real-provider verification limits honestly.

- Write source-code and configuration comments, repository Markdown documents, role prompts, and Skill instructions in English. Preserve localized product UI text, source quotations, test data, and protocol literals unless a task explicitly changes them.
