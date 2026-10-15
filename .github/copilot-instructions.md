# Copilot instructions

Read and follow [AGENTS.md](../AGENTS.md). It is the single source of instructions for every coding agent in this repository.

Copilot notes:

- Suggestions in `src/detectors/` must not add network calls or execute repository content; scans are local and deterministic.
- Do not suggest edits to generated files listed in AGENTS.md (`plugins/`, `dist/action/index.js`, `docs/ROADMAP.md`).
