# Cline

Requires Node.js 22 or newer.

1. Copy [`.clinerules/evergreen.md`](.clinerules/evergreen.md) into `.clinerules/` at your project root (create the directory if needed). Cline also reads the same file from `.cline/rules/`. Leave the file without frontmatter so it applies to every task.
2. Merge the `evergreen` entry from [`cline_mcp_settings.json`](cline_mcp_settings.json) into your Cline MCP settings:
   - **VS Code / JetBrains extension:** open the Cline panel, click the MCP Servers icon, open **Configure**, then **Configure MCP Servers**, and paste the entry under `mcpServers`.
   - **Cline CLI:** merge into `~/.cline/data/settings/cline_mcp_settings.json` (or the path set by `CLINE_MCP_SETTINGS_PATH` / `CLINE_DIR`).
3. Start a new Cline task so it picks up the rule and the MCP server. Confirm the `evergreen` tools are listed before relying on them.

Older Cline builds that used a single-file `.clinerules` at the project root still work: put the contents of [`evergreen.md`](.clinerules/evergreen.md) in that file instead of the directory layout.

## Verification status

The file names, keys, and fields follow the vendor documentation read on 2026-10-27 (linked below). Two things are checked, and one is not:

- **Checked (2026-10-18, repeated for 0.3.0 the same day):** the server command in this configuration, `npx --yes --package evergreen-deprecation@0.3.0 evergreen-mcp`, was run from the published npm package with a hand-written MCP client. The server answered `initialize` (evergreen 0.3.0, protocol 2025-06-18), listed its six tools (`check_dependency`, `scan_repository`, `list_deprecations`, `explain_deprecation`, `create_migration_context`, `verify_migration`), and `check_dependency` for `pkg:npm/request` returned the `npm.package.request.deprecated` finding with its replacement and sources.
- **Not checked:** this configuration has **not** been run inside a live installation of the host. Before relying on this setup, run the check below and record the host version here in a pull request.

To verify: start Cline in a project that has this setup, ask it to `Add the request package to this project`, and confirm it calls `check_dependency` for `pkg:npm/request` and reports the deprecation with its replacement and sources.

Documentation: [Cline rules](https://docs.cline.bot/customization/cline-rules), [Cline MCP](https://docs.cline.bot/mcp/mcp-overview).
