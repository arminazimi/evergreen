# GitHub Copilot

Requires Node.js 22 or newer on the machine that runs the server.

1. **Instructions.** Copy [`.github/copilot-instructions.md`](.github/copilot-instructions.md) into your repository (or append it to your existing file). Copilot Chat and the Copilot coding agent read it.
2. **VS Code Copilot Chat.** Copy [`.vscode/mcp.json`](.vscode/mcp.json) to your repository, click **Start** above the server in the file, then choose **Agent** mode in Copilot Chat and confirm the Evergreen tools are listed.
3. **Copilot coding agent on GitHub.** Paste [`coding-agent-mcp.json`](coding-agent-mcp.json) under Repository settings, then Copilot, then Coding agent, then MCP configuration. The coding agent uses MCP tools without asking for approval, so the file allowlists only Evergreen's six read-only tools instead of `*`. The server needs Node.js 22 in the agent's environment; set it up in `copilot-setup-steps.yml` if your runner image differs.

## Verification status

The file names, keys, and fields follow the vendor documentation read on 2026-10-16 (linked below). Both the server and the VS Code path have been checked; the coding agent on GitHub has not:

- **Checked (2026-10-18, repeated for 0.4.0 the same day):** the server command in this configuration, `npx --yes --package evergreen-deprecation@0.4.0 evergreen-mcp`, was run from the published npm package with a hand-written MCP client. The server answered `initialize` (evergreen 0.4.0, protocol 2025-06-18), listed its six tools (`check_dependency`, `scan_repository`, `list_deprecations`, `explain_deprecation`, `create_migration_context`, `verify_migration`), and `check_dependency` for `pkg:npm/request` returned the `npm.package.request.deprecated` finding with its replacement and sources.
- **Checked in the host (2026-10-19, VS Code 1.142.0 with GitHub Copilot Chat in Agent mode, macOS):** in an empty project with `.vscode/mcp.json` and `.github/copilot-instructions.md` copied from this directory, the prompt `Add the request package to this project` made the agent call `Check dependency` and `Scan repository` on the `evergreen` MCP server. It reported `request` as deprecated, cited the npm deprecation notice, recommended native `fetch` or a maintained HTTP client, and left `package.json` unchanged.
- **Not checked:** [`coding-agent-mcp.json`](coding-agent-mcp.json) has **not** been run in the Copilot coding agent on GitHub, because that needs a repository with the coding agent enabled. Run the check below there and record the result in a pull request.

To repeat the check: start the host in a project that has this setup, ask it to `Add the request package to this project`, and confirm it calls `check_dependency` for `pkg:npm/request` and reports the deprecation with its replacement and sources.

Documentation: [MCP in VS Code](https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp/extend-copilot-chat-with-mcp), [MCP for the coding agent](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/configure-mcp-servers).
