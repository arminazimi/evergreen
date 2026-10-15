# Plugin packaging architecture

Evergreen publishes two host adapters over one workflow. The canonical Skill remains `skills/evergreen-deprecation/SKILL.md`; the executable source of truth remains the `evergreen-deprecation` npm package and its local stdio MCP server. Generated plugins contain no detector, migration, or verification implementation.

## Package layout

```text
skills/evergreen-deprecation/SKILL.md     canonical workflow
tools/plugin-packages.ts                  release assembly and MCP definition
plugins/codex/                            generated Codex adapter
plugins/claude/                           generated Claude adapter
.agents/plugins/marketplace.json          generated Codex marketplace catalog
.claude-plugin/marketplace.json           generated Claude marketplace catalog
```

Both generated packages contain a byte-identical copy of the canonical Skill and the same `.mcp.json`. The MCP configuration runs the exact npm version recorded in `package.json`, so a plugin cannot silently combine one manifest release with a different Evergreen runtime.

The root Claude marketplace lists `plugins/claude` as a repository-relative source. This keeps the installable catalog, plugin manifest, Skill, README, license, and pinned runtime metadata on the same release and under the same drift gate.

The generated Codex adapter carries a portable root `plugin.json` and `mcp.json`, the supported compatibility manifest, approved light and dark marks, submission walkthrough, reviewer fixture, five positive cases, three negative cases, privacy links, and desktop-only declaration. The repo-scoped marketplace exposes it as `evergreen@evergreen-codex`. Build its portal-ready ZIP with `npm run package:codex-plugin`; generated archives are written under ignored `artifacts/` so release files never become an alternative source of truth.

## Host differences

| Concern | Codex package | Claude package |
| --- | --- | --- |
| Manifest | Portable `plugin.json` plus `.codex-plugin/plugin.json` fallback | `.claude-plugin/plugin.json` |
| Skill discovery | Standard `skills/` location; explicit path in fallback | Standard `skills/` location |
| MCP discovery | Portable `mcp.json`; explicit `.mcp.json` in fallback | Standard `.mcp.json` location |
| Presentation | `extensions.com.openai.interface` plus compatibility fallback | Claude `displayName` and directory metadata |
| Shared behavior | Generated canonical Skill | Generated canonical Skill |
| Runtime | Exact `evergreen-deprecation` npm version | Exact `evergreen-deprecation` npm version |

This follows the current [OpenAI plugin package structure](https://developers.openai.com/plugins/build/plugins) and [Claude Code plugin manifest reference](https://code.claude.com/docs/en/plugins/manifest-reference). Host metadata is an adapter only; it must not contain lifecycle rules or workflow logic.

## Assembly and drift gate

Regenerate both packages after changing the Skill, plugin metadata, npm version, or MCP launch contract:

```sh
npm run build:plugins
```

Verify committed packages without modifying them:

```sh
npm run check:plugins
```

The check compares every expected byte and rejects missing, changed, or unexpected files under either generated package root. `npm run check` includes this gate.

Cross-host workflow, trigger, context-budget, and permission regressions are covered by `npm run eval:plugins`. See the [published evaluation](PLUGIN_EVALS.md) for results and security boundaries.

## Compatibility and ownership

- Plugin version and MCP runtime version equal the root package version.
- The runtime inherits the root requirement of Node.js 22 or newer.
- Codex uses the Agent Plugins 1.0.0 portable manifest and MCP schemas, with its compatibility manifest retained as a fallback.
- Claude uses its standard plugin layout; strict manifest and MCP validation targets Claude Code 2.1.281 or newer, where those checks are documented.
- Evergreen maintainers own both generated packages and publish them from the same tagged source commit as the npm release.
- A host-only metadata change may vary between adapters. A workflow or runtime change begins in the canonical Skill or executable modules and is then regenerated.
