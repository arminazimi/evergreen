# Evergreen deprecation

Use Evergreen's evidence-backed repository lifecycle workflow from a compatible coding agent. The Skill covers discovery, explanation, migration context, and fresh verification for deprecated runtimes, package declarations, and GitHub Actions.

## Install and update

Install the Skill from the Evergreen monorepo:

```bash
npx skills add arminazimi/evergreen
```

The repository exposes this Skill and four focused ones: `evergreen-nodejs`, `evergreen-python`, `evergreen-github-actions`, and `evergreen-containers`. To select one explicitly or automate installation:

```bash
npx skills add arminazimi/evergreen --skill evergreen-deprecation --yes
```

Update an existing installation:

```bash
npx skills update evergreen-deprecation
```

## Example requests

- “Scan this repository for deprecated runtimes, packages, and GitHub Actions.”
- “Explain this Evergreen finding and show its lifecycle evidence.”
- “Create migration context for this finding and migrate the affected usages.”
- “Verify that the reported deprecation is gone after these changes.”

Routine dependency upgrades, vulnerability audits, deprecated application APIs, and unrelated modernization should use other workflows.

## Execution path

The Skill needs either the local `evergreen-mcp` stdio server or the `evergreen` CLI on `PATH`. It contains instructions and evaluation data only: no executable Skill scripts, credentials, hooks, or pre-approved tools.

Evergreen reads repository files locally and makes no hosted Evergreen request. Structured results can contain file paths and short source excerpts; the selected agent host handles those results under its own privacy policy. Migration packets may suggest verification commands, but the host's normal permission rules still apply before execution.

## Compatibility

Installation from `arminazimi/evergreen` was validated with the skills CLI on 2026-10-15 for:

| Host | CLI target | Result |
| --- | --- | --- |
| Codex | `codex` | Installed |
| Claude Code | `claude-code` | Installed |
| Cursor | `cursor` | Installed |
| GitHub Copilot | `github-copilot` | Installed |
| Gemini CLI | `gemini-cli` | Installed |

See the [full Agent Skill guide](../../docs/AGENT_SKILLS.md) for the reproducible trigger evaluation and detailed limits.
