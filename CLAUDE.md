# CLAUDE.md

Read and follow [AGENTS.md](AGENTS.md). It is the single source of instructions for every coding agent in this repository.

Claude Code notes:

- Run `npm run check` before opening a pull request; it is the same gate CI runs.
- `plugins/claude/` and `.claude-plugin/marketplace.json` are generated from `skills/` — change the Skill and run `npm run build:plugins`, never edit them directly.
