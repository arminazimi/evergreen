# Cursor

Requires Node.js 22 or newer.

1. Copy [`.cursor/mcp.json`](.cursor/mcp.json) to the same path in your project (or merge its `evergreen` entry into `~/.cursor/mcp.json` to use it in every project).
2. Copy [`.cursor/rules/evergreen.mdc`](.cursor/rules/evergreen.mdc) to `.cursor/rules/` in your project. Cursor only reads project rules with the `.mdc` extension; `alwaysApply: true` includes it in every chat.
3. Restart Cursor and enable the `evergreen` server under Settings, then MCP.

## Verification status

The file names, keys, and fields follow the vendor documentation read on 2026-10-16 (linked below). Both the server and the host have been checked:

- **Checked (2026-10-18, repeated for 0.3.0 the same day):** the server command in this configuration, `npx --yes --package evergreen-deprecation@0.3.0 evergreen-mcp`, was run from the published npm package with a hand-written MCP client. The server answered `initialize` (evergreen 0.3.0, protocol 2025-06-18), listed its six tools (`check_dependency`, `scan_repository`, `list_deprecations`, `explain_deprecation`, `create_migration_context`, `verify_migration`), and `check_dependency` for `pkg:npm/request` returned the `npm.package.request.deprecated` finding with its replacement and sources.
- **Checked in the host (2026-10-19, Cursor 3.25.9, macOS):** in an empty project with `.cursor/mcp.json` and `.cursor/rules/evergreen.mdc` copied from this directory, the prompt `Add the request package to this project` made the agent call `check_dependency` for `pkg:npm/request` through the `evergreen` server. It reported the package as affected (deprecated since 2020-02-11), cited the npm deprecation notice, recommended native `fetch` or a maintained HTTP client, and did not add `request`.

To repeat the check: start the host in a project that has this setup, ask it to `Add the request package to this project`, and confirm it calls `check_dependency` for `pkg:npm/request` and reports the deprecation with its replacement and sources.

Documentation: [Cursor rules](https://cursor.com/docs/rules), [Cursor MCP](https://cursor.com/docs/mcp).
