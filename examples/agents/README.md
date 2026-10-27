# Agent host setups

Copy-paste setups that give a coding agent the Evergreen dependency guardrail: an MCP server entry for `evergreen-mcp`, which exposes the `check_dependency` tool, and an instruction file that tells the agent to call it before adding a dependency. The instruction text is the same everywhere ([`dependency-check.md`](dependency-check.md)); only the file names and config keys differ per host.

| Host | Directory |
| --- | --- |
| Cursor | [`cursor/`](cursor/) |
| Gemini CLI | [`gemini/`](gemini/) |
| GitHub Copilot | [`copilot/`](copilot/) |
| Kilo Code | [`kilo/`](kilo/) |
| Windsurf | [`windsurf/`](windsurf/) |

Claude Code and Codex have plugins that add a hook as well; see [Claude plugin](../../docs/CLAUDE_PLUGIN.md) and [Codex plugin](../../docs/CODEX_PLUGIN.md). General MCP behavior is in the [local MCP guide](../../docs/MCP.md).

Every config pins the exact npm release (`evergreen-deprecation@<version>`), so the server and its lifecycle rules are reproducible. All Evergreen tools are read-only and run on your machine; nothing is sent to an Evergreen service. A test keeps these files in step with the package version and with the tools the server exposes.
