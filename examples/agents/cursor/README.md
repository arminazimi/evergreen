# Cursor

Requires Node.js 22 or newer.

1. Copy [`.cursor/mcp.json`](.cursor/mcp.json) to the same path in your project (or merge its `evergreen` entry into `~/.cursor/mcp.json` to use it in every project).
2. Copy [`.cursor/rules/evergreen.mdc`](.cursor/rules/evergreen.mdc) to `.cursor/rules/` in your project. Cursor only reads project rules with the `.mdc` extension; `alwaysApply: true` includes it in every chat.
3. Restart Cursor and enable the `evergreen` server under Settings, then MCP.

## Verification status

The file names, keys, and fields follow the vendor documentation read on 2026-10-16 (linked below). Two things are checked, and one is not:

- **Checked (2026-10-18, repeated for 0.3.0 the same day):** the server command in this configuration, `npx --yes --package evergreen-deprecation@0.3.0 evergreen-mcp`, was run from the published npm package with a hand-written MCP client (the same check with the 0.2.0 release passed on 2026-10-18). The server answered `initialize` (evergreen 0.3.0, protocol 2025-06-18), listed its six tools (`check_dependency`, `scan_repository`, `list_deprecations`, `explain_deprecation`, `create_migration_context`, `verify_migration`), and `check_dependency` for `pkg:npm/request` returned the `npm.package.request.deprecated` finding with its replacement and sources.
- **Not checked:** this configuration has **not** been run inside a live installation of the host, because that needs a licensed host session. Before relying on this setup, run the check below and record the host version here in a pull request.

To verify: start the host in a project that has this setup, ask it to `Add the request package to this project`, and confirm it calls `check_dependency` for `pkg:npm/request` and reports the deprecation with its replacement and sources.

Documentation: [Cursor rules](https://cursor.com/docs/rules), [Cursor MCP](https://cursor.com/docs/mcp).
