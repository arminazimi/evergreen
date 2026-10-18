# GitHub Copilot

Requires Node.js 22 or newer on the machine that runs the server.

1. **Instructions.** Copy [`.github/copilot-instructions.md`](.github/copilot-instructions.md) into your repository (or append it to your existing file). Copilot Chat and the Copilot coding agent read it.
2. **VS Code Copilot Chat.** Copy [`.vscode/mcp.json`](.vscode/mcp.json) to your repository, click **Start** above the server in the file, then choose **Agent** mode in Copilot Chat and confirm the Evergreen tools are listed.
3. **Copilot coding agent on GitHub.** Paste [`coding-agent-mcp.json`](coding-agent-mcp.json) under Repository settings, then Copilot, then Coding agent, then MCP configuration. The coding agent uses MCP tools without asking for approval, so the file allowlists only Evergreen's six read-only tools instead of `*`. The server needs Node.js 22 in the agent's environment; set it up in `copilot-setup-steps.yml` if your runner image differs.

## Verification status

The file names, keys, and fields follow the vendor documentation read on 2026-10-16 (linked below). Two things are checked, and one is not:

- **Checked (2026-10-18, repeated for 0.3.0 the same day):** the server command in this configuration, `npx --yes --package evergreen-deprecation@0.3.0 evergreen-mcp`, was run from the published npm package with a hand-written MCP client (the same check with the 0.2.0 release passed on 2026-10-18). The server answered `initialize` (evergreen 0.3.0, protocol 2025-06-18), listed its six tools (`check_dependency`, `scan_repository`, `list_deprecations`, `explain_deprecation`, `create_migration_context`, `verify_migration`), and `check_dependency` for `pkg:npm/request` returned the `npm.package.request.deprecated` finding with its replacement and sources.
- **Not checked:** this configuration has **not** been run inside a live installation of the host, because that needs a licensed host session. Before relying on this setup, run the check below and record the host version here in a pull request.

To verify: start the host in a project that has this setup, ask it to `Add the request package to this project`, and confirm it calls `check_dependency` for `pkg:npm/request` and reports the deprecation with its replacement and sources.

Documentation: [MCP in VS Code](https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp/extend-copilot-chat-with-mcp), [MCP for the coding agent](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/configure-mcp-servers).
