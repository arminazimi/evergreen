# Kilo Code

Requires Node.js 22 or newer.

1. Copy [`kilo.jsonc`](kilo.jsonc) to the root of your project (or merge its `mcp.evergreen` entry and `instructions` list into your existing `kilo.jsonc`, or into `~/.config/kilo/kilo.jsonc` for every project).
2. Copy [`.kilo/rules/evergreen.md`](.kilo/rules/evergreen.md) to `.kilo/rules/` in your project. The `instructions` entry loads every file in that directory.
3. Start a new chat session so Kilo picks up the changes.

Older Kilo Code installations that use `.kilocode/mcp.json` and `.kilocode/rules/` take the same server command and the same rule file at those paths. Kilo includes an existing `.kilocode/rules/` directory automatically for backward compatibility.

## Verification status

The file names, keys, and fields follow the vendor documentation read on 2026-10-16 (linked below). Two things are checked, and one is not:

- **Checked (2026-10-18):** the server command in this configuration, `npx --yes --package evergreen-deprecation@0.2.0 evergreen-mcp`, was run from the published npm package with a hand-written MCP client. The server answered `initialize` (evergreen 0.2.0, protocol 2025-06-18), listed its six tools (`check_dependency`, `scan_repository`, `list_deprecations`, `explain_deprecation`, `create_migration_context`, `verify_migration`), and `check_dependency` for `pkg:npm/request` returned the `npm.package.request.deprecated` finding with its replacement and sources.
- **Not checked:** this configuration has **not** been run inside a live installation of the host, because that needs a licensed host session. Before relying on this setup, run the check below and record the host version here in a pull request.

To verify: start the host in a project that has this setup, ask it to `Add the request package to this project`, and confirm it calls `check_dependency` for `pkg:npm/request` and reports the deprecation with its replacement and sources.

Documentation: [Kilo MCP servers](https://kilo.ai/docs/automate/mcp/using-in-kilo-code), [Kilo custom rules](https://kilo.ai/docs/customize/custom-rules).
