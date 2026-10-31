# AGENTS.md snippet

Tell the agents working in your project to check dependencies with Evergreen before adding them. Copy the plain-text block below into `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, or any other Markdown instruction file your host reads. It is the canonical copy-paste version of the dependency-check rule: plain Markdown, no host-specific syntax, and nothing to install beyond npm.

If the project also has the [Evergreen MCP server](agents/README.md), agents can call the `check_dependency` tool with the same arguments instead of the CLI command.

```markdown
## Dependency lifecycle check

Before you add a new dependency, runtime, or GitHub Action to this project (or change its pinned version), check it with Evergreen using its Package URL.

- Run `npx evergreen-deprecation check pkg:npm/<name>@<version>` for an npm package or `npx evergreen-deprecation check pkg:github/<owner>/<repo>@<ref>` for a GitHub Action, with the exact version or ref you intend to pin. With the `evergreen-mcp` server configured, call the `check_dependency` tool with the same arguments instead.
- `affected` reports an end-of-life, deprecated, or retired package: do not add it. Prefer the replacement the check names, cite the evidence links it returns, and ask before choosing a different replacement.
- `version-dependent` means rules exist only for some versions: run the check again with the exact version you intend to use.
- `no-data` means Evergreen has no rule for that package; it is not a claim that the package is safe.
- Do not use Evergreen for security vulnerability audits or for routine upgrades of dependencies the project already uses.
```

Evergreen states the same rule for contributors to this repository in its [AGENTS.md `Dependencies` section](../AGENTS.md#dependencies), where the check runs from source as `npm run dev -- check pkg:npm/<name>@<version>` or `npm run dev -- check pkg:github/<owner>/<repo>@<ref>`. That section is the source of truth: change it first, then mirror the change here instead of wording the rule again somewhere else.

See [`examples/agents/`](agents/README.md) for full per-host setups with an MCP server entry, the [Agent Skill guide](../docs/AGENT_SKILLS.md) for installing the skill itself, and the walkthrough [Stop your coding agent from adding deprecated packages](../docs/guides/agent-dependency-guard.md) for the check on a real deprecated package.
