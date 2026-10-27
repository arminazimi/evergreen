# Windsurf

Requires Node.js 22 or newer.

1. Copy [`.windsurf/rules/evergreen.md`](.windsurf/rules/evergreen.md) to `.windsurf/rules/` in your project. `trigger: always_on` includes it in every Cascade chat. Older Windsurf installs that still read a root `.windsurfrules` file can paste the rule body there instead.
2. Merge the `evergreen` entry from [`mcp_config.json`](mcp_config.json) into the MCP config Cascade opens (Cascade → MCP → Open MCP config file). On current installs that file is usually `~/.config/devin/mcp_config.json` (or `%AppData%/devin/mcp_config.json` on Windows). Older editor builds may use `~/.codeium/windsurf/mcp_config.json` instead; use the path the Open MCP config file action opens.
3. Refresh MCP servers in Cascade and confirm the `evergreen` tools are listed.

## Verification status

The file names, keys, and fields follow the vendor documentation read on 2026-10-27 (linked below). The server command has been checked; the host has not:

- **Checked (2026-10-18, repeated for 0.3.0 the same day):** the server command in this configuration, `npx --yes --package evergreen-deprecation@0.3.0 evergreen-mcp`, was run from the published npm package with a hand-written MCP client. The server answered `initialize` (evergreen 0.3.0, protocol 2025-06-18), listed its six tools (`check_dependency`, `scan_repository`, `list_deprecations`, `explain_deprecation`, `create_migration_context`, `verify_migration`), and `check_dependency` for `pkg:npm/request` returned the `npm.package.request.deprecated` finding with its replacement and sources.
- **Not checked:** this configuration has **not** been run inside a live installation of the host, because that needs a licensed host session. Before relying on this setup, run the check below and record the host version here in a pull request.

To verify: start the host in a project that has this setup, ask it to `Add the request package to this project`, and confirm it calls `check_dependency` for `pkg:npm/request` and reports the deprecation with its replacement and sources.

Documentation: [Windsurf Cascade MCP](https://docs.devin.ai/windsurf/plugins/cascade/mcp), [Windsurf Memories & Rules](https://docs.devin.ai/windsurf/plugins/cascade/memories).
