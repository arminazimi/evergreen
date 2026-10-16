# Cursor

Requires Node.js 22 or newer.

1. Copy [`.cursor/mcp.json`](.cursor/mcp.json) to the same path in your project (or merge its `evergreen` entry into `~/.cursor/mcp.json` to use it in every project).
2. Copy [`.cursor/rules/evergreen.mdc`](.cursor/rules/evergreen.mdc) to `.cursor/rules/` in your project. Cursor only reads project rules with the `.mdc` extension; `alwaysApply: true` includes it in every chat.
3. Restart Cursor and enable the `evergreen` server under Settings, then MCP.

## Verification status

The file names, keys, and fields follow the vendor documentation read on 2026-10-16 (linked below). They have **not** yet been run inside a live installation of the host, because that needs the `evergreen-deprecation` package to be published and a licensed host session. Before relying on this setup, run the check below and record the host version here in a pull request.

To verify: start the host in a project that has this setup, ask it to `Add the request package to this project`, and confirm it calls `check_dependency` for `pkg:npm/request` and reports the deprecation with its replacement and sources.

Documentation: [Cursor rules](https://cursor.com/docs/rules), [Cursor MCP](https://cursor.com/docs/mcp).
