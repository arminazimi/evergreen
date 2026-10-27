# AGENTS.md snippet

Tell the agents working in your project to check dependencies with Evergreen before adding them. Copy the plain-text block below into `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, or any other Markdown instruction file your host reads. It has no host-specific syntax and uses only the CLI, so it needs nothing installed beyond npm.

If the project also has the [Evergreen MCP server](agents/README.md), agents can call the `check_dependency` tool with the same arguments instead of the CLI command.

```markdown
## Dependency lifecycle check

Before you add a new package, runtime, or GitHub Action to this project, or pick one to replace another, check it with Evergreen.

- Run `npx evergreen-deprecation check <purl>` — for example `npx evergreen-deprecation check pkg:npm/request@2.88.2`, `pkg:pypi/nose`, or `pkg:github/actions/checkout@v4`. If the `evergreen-mcp` server is configured, call the `check_dependency` tool instead.
- If the status is `affected`, prefer the replacement it names and tell the user why, citing the evidence links it returns.
- `version-dependent` means rules exist only for some versions: run the check again with the version you intend to use. `no-data` means Evergreen has no rule for that package; it is not a claim that the package is safe.
- Do not use Evergreen for security vulnerability audits or for routine upgrades of dependencies the project already uses.
```

See [`examples/agents/`](agents/README.md) for full per-host setups with an MCP server entry, and the [Agent Skill guide](../docs/AGENT_SKILLS.md) for installing the skill itself.
