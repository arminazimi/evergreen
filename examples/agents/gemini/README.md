# Gemini CLI

Requires Node.js 22 or newer. Two ways to set it up.

**As an extension** (MCP server and instructions together). The directory is a complete extension: [`gemini-extension.json`](gemini-extension.json) declares the `evergreen` server and loads [`GEMINI.md`](GEMINI.md) as context. Install it from this directory:

```sh
gemini extensions install ./examples/agents/gemini
```

(or copy the two files into a repository of your own and install from its GitHub URL).

**As plain settings.** Merge [`settings.json`](settings.json) into `.gemini/settings.json` in your project (or `~/.gemini/settings.json`) and add the contents of [`GEMINI.md`](GEMINI.md) to your project's `GEMINI.md`. `trust` stays `false`, so Gemini CLI still asks before it calls a tool.

## Verification status

The file names, keys, and fields follow the vendor documentation read on 2026-10-16 (linked below). Two things are checked, and one is not:

- **Checked (2026-10-18):** the server command in this configuration, `npx --yes --package evergreen-deprecation@0.2.0 evergreen-mcp`, was run from the published npm package with a hand-written MCP client. The server answered `initialize` (evergreen 0.2.0, protocol 2025-06-18), listed its six tools (`check_dependency`, `scan_repository`, `list_deprecations`, `explain_deprecation`, `create_migration_context`, `verify_migration`), and `check_dependency` for `pkg:npm/request` returned the `npm.package.request.deprecated` finding with its replacement and sources.
- **Not checked:** this configuration has **not** been run inside a live installation of the host, because that needs a licensed host session. Before relying on this setup, run the check below and record the host version here in a pull request.

To verify: start the host in a project that has this setup, ask it to `Add the request package to this project`, and confirm it calls `check_dependency` for `pkg:npm/request` and reports the deprecation with its replacement and sources.

Documentation: [Gemini CLI extensions](https://geminicli.com/docs/extensions/reference/), [Gemini CLI MCP servers](https://geminicli.com/docs/tools/mcp-server/).
