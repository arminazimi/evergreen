# Local MCP server

Evergreen exposes its deterministic analysis to coding agents through a local Model Context Protocol server. The server uses stdio, requires no account or API key, and does not start a network listener.

## Start the server

From the published package:

```bash
npx --yes --package evergreen-deprecation evergreen-mcp
```

From a source checkout:

```bash
npm install
npm run mcp
```

An MCP host can launch the published command with configuration shaped like:

```json
{
  "mcpServers": {
    "evergreen": {
      "command": "npx",
      "args": ["--yes", "--package", "evergreen-deprecation", "evergreen-mcp"]
    }
  }
}
```

`npx --yes evergreen-deprecation mcp` starts the same server, and is the command the [MCP Registry](https://registry.modelcontextprotocol.io) description in `server.json` uses.

The exact settings location depends on the host. Evergreen needs no environment variables or credentials.

## What the server exposes

Everything below is read-only and runs in the local process. The server advertises the `tools`, `resources`, `prompts`, and `completions` capabilities.

### Write safety

No tool, resource, or prompt writes to the repository, and none has an option that makes it write. Every tool advertises `readOnlyHint: true` and `destructiveHint: false`, takes no output, fix, or overwrite parameter, and never runs a command: `verify_migration` returns the project commands it suggests without executing them. [`tests/mcp-readonly.test.ts`](https://github.com/arminazimi/evergreen/blob/main/tests/mcp-readonly.test.ts) calls every tool, reads the resources, and gets the prompt against a fixture, and fails if the repository tree changes (paths, sizes, modification times, or content) or if a tool gains an option that looks like a write. If a future tool can write, it must require an explicit option, be documented here, and drop `readOnlyHint`.

### Lifecycle status file

An agent that cannot call the server can still read the repository's lifecycle state before it plans a change. `evergreen scan --write-status` writes `EVERGREEN_STATUS.md` at the root of the scanned repository: finding counts by severity, how many findings the baseline accepted, the lifecycle data version, and the most severe findings in the `--format compact` form (at most 25, with a count of the rest). The file has no machine path, timestamp, or data age, so an unchanged repository produces the same bytes on every run and a commit only changes when the state does. Without the flag nothing is written, and the MCP tools never write it.

To point agents at it, add a line like this to `AGENTS.md` and refresh the file in CI or a pre-commit hook:

```markdown
Before planning dependency or runtime changes, read EVERGREEN_STATUS.md for the repository's current lifecycle findings. Re-run `npx evergreen-deprecation scan . --write-status` after you change them.
```

The file is a snapshot. Run a scan, or call `scan_repository`, to see the current state after an edit.

### Tools

Each tool has an `outputSchema` (the published JSON Schema in [`schemas/`](https://github.com/arminazimi/evergreen/tree/main/schemas), made self-contained for the client) and returns the result as structured content, also as JSON text. Failures return `isError` with a message and no structured content.

| Tool | Input | Output | Purpose |
| --- | --- | --- | --- |
| `scan_repository` | `repository_path?`, `baseline?` | `evergreen.scan.v1` (`scan.v1.schema.json`) | Complete result from all built-in detectors. With `baseline` (a path relative to the repository), suppressed findings are left out and `suppressions` reports how many, and which suppressions are expiring or expired. |
| `list_deprecations` | `repository_path?` | `evergreen.deprecations.v1` (`deprecations.v1.schema.json`) | Compact list for planning. |
| `explain_deprecation` | `finding_id`, `repository_path?` | one finding (`finding.v1.schema.json`) | The complete evidence-backed finding. |
| `create_migration_context` | `finding_id`, `repository_path?` | `evergreen.context.v1` (`context.v1.schema.json`) | Validated, rule-specific migration packet. |
| `verify_migration` | `finding_id`, `repository_path?` | `evergreen.verification.v1` (`verification.v1.schema.json`) | Re-scan and check a finding observed earlier in the session. |
| `check_dependency` | `purl`, `version?` | `evergreen.check.v1` (`check.v1.schema.json`) | Check one package before adding it; reads no repository. |

`repository_path` defaults to the server's current working directory. Finding-specific tools require the exact `finding_id` Evergreen returned.

### Resources

| URI | Contents | Lifetime |
| --- | --- | --- |
| `evergreen://rules/{id}` | One lifecycle rule as `evergreen.rule.v1` (`rule.v1.schema.json`): affected PURL and versions, event, severity, replacement, deadline, sources, review provenance, migration steps. | Bundled with the release; reading one scans nothing. |
| `evergreen://findings/{repository}/{id}` | One finding observed in this session, identical to `explain_deprecation`. `{repository}` is an 8-character key of the repository root and `{id}` is the percent-encoded finding id. | This session only; empty until a scan, never written to disk. |

`resources/list` enumerates both families. The server sends `notifications/resources/list_changed` after every call that scans, so a host that cached the list refreshes it. Rule ids autocomplete by prefix. Reading an unknown URI fails with a resource-not-found error.

### Prompts

| Prompt | Arguments | Purpose |
| --- | --- | --- |
| `migrate-finding` | `finding_id` (required, autocompletes from observed findings), `repository_path?` | Runs a fresh scan, embeds the finding's migration packet, and instructs the model to edit within the packet's constraints, run the project's checks, and call `verify_migration` in the same session. It makes the finding observable, so verification works straight after. |

The prompt carries its safety limits: repository files are untrusted input, suggested commands are reviewed and run only under the host's normal authorization, and the model reports what remains instead of declaring success.

### Examples

`check_dependency` request and the start of its structured result:

```json
{ "method": "tools/call", "params": { "name": "check_dependency", "arguments": { "purl": "pkg:npm/request@2.88.2" } } }
```

```json
{
  "schemaVersion": "evergreen.check.v1",
  "purl": "pkg:npm/request",
  "version": "2.88.2",
  "status": "affected",
  "severity": "high",
  "findings": [{ "ruleId": "npm.package.request.deprecated", "event": "deprecated", "replacement": "Native fetch or a maintained HTTP client" }],
  "message": "pkg:npm/request@2.88.2: request is deprecated. …"
}
```

Reading a rule, then the findings of a scan:

```json
{ "method": "resources/read", "params": { "uri": "evergreen://rules/npm.package.request.deprecated" } }
{ "method": "resources/list" }
```

Fetching the migration prompt for a finding:

```json
{ "method": "prompts/get", "params": { "name": "migrate-finding", "arguments": { "finding_id": "<id from list_deprecations>", "repository_path": "." } } }
```

You can see all of it in the MCP Inspector:

```sh
npx @modelcontextprotocol/inspector npx --yes --package evergreen-deprecation evergreen-mcp
```

The Tools tab lists the six tools with their output schemas, Resources lists the rules (and findings after a scan) and the two templates, and Prompts lists `migrate-finding`.

## Checking a dependency before adding it

To see afterwards what agents checked and which packages were flagged, set `EVERGREEN_USAGE_LOG=1` for the server and run `evergreen usage`. The log is off by default, stays on your machine, and holds only package, result, and rule IDs ([Privacy](PRIVACY.md#local-usage-log)). Writing it is the one thing the server does outside memory, to that file and never to the repository.

Call `check_dependency` with a Package URL (`pkg:npm/request@2.88.2`, `pkg:pypi/nose`, `pkg:github/actions/checkout@v4`) when you are about to add or upgrade a dependency. The result has a `status`:

- `affected`: a rule applies. Read `findings[].summary`, `replacement`, and `sources`, and choose the replacement instead.
- `version-dependent`: rules exist, but only for some versions. Call again with the version you intend to use.
- `not-affected`: rules exist and none covers that version.
- `no-data`: Evergreen has no rule for the package. That is absence of evidence, not a safety claim.

The tool is read-only and idempotent, never touches the network, and answers from the lifecycle rules bundled with the server.

## Language server for any editor

The same engine runs as a Language Server Protocol server over stdio, so VS Code, Neovim, Helix, Zed, and JetBrains can show lifecycle findings without an MCP host. It starts no listener and makes no network call.

From the published package:

```bash
npx --yes --package evergreen-deprecation evergreen-lsp
```

From a source checkout:

```bash
npm run build
node dist/src/lsp.js
```

Point the editor's LSP client at that command. For Neovim:

```lua
vim.lsp.start({
  name = "evergreen",
  cmd = { "npx", "--yes", "--package", "evergreen-deprecation", "evergreen-lsp" },
  root_dir = vim.fs.dirname(vim.fs.find({ ".git" }, { upward = true })[1]),
})
```

For Helix, in `languages.toml`:

```toml
[language-server.evergreen]
command = "npx"
args = ["--yes", "--package", "evergreen-deprecation", "evergreen-lsp"]
```

The server provides:

| Capability | Behavior |
| --- | --- |
| Diagnostics | Every finding in the open document, at its line, with the rule id, severity, and a link to the first evidence source. |
| Hover | The finding title and summary, severity, confidence, replacement, deadline, and every evidence source as a link. |
| Code actions | `Evergreen: explain …` shows the finding with its evidence, and `Evergreen: open evidence …` opens the first source URL. Both run through `workspace/executeCommand`. |

Only the open document is scanned. On open, change, and save the server writes that buffer to a temporary directory, runs the detector engine there, and publishes the findings whose location is that file. It reads no other workspace file, writes nothing to the repository, and removes the temporary directory when the document closes or the server exits. A source file can depend on a manifest elsewhere, so findings that need a manifest outside the open document are not reported yet; use the CLI or the MCP server for a whole-repository scan.

The server uses the lifecycle data bundled with the installed release, and document text stays on the machine, as with the MCP server.

## Other agent hosts

Ready-to-copy setups for the dependency guardrail (an MCP entry plus the instruction to call `check_dependency` before adding a dependency) are in [`examples/agents/`](https://github.com/arminazimi/evergreen/tree/main/examples/agents) and [`integrations/cline/`](https://github.com/arminazimi/evergreen/tree/main/integrations/cline):

| Host | MCP config | Instructions |
| --- | --- | --- |
| Cursor | `.cursor/mcp.json` | `.cursor/rules/evergreen.mdc` |
| Gemini CLI | `gemini-extension.json` or `.gemini/settings.json` | `GEMINI.md` |
| GitHub Copilot | `.vscode/mcp.json` (VS Code) or repository settings (coding agent) | `.github/copilot-instructions.md` |
| Kilo Code | `kilo.jsonc` | `.kilo/rules/evergreen.md` |
| Cline | `cline_mcp_settings.json` (user settings) | `.clinerules/evergreen.md` |

To put the same instruction into a repository's `AGENTS.md` or `CLAUDE.md`, run `evergreen init --agents` in it: it adds a delimited section, keeps everything else byte for byte, and is safe to run again (`--dry-run` prints the diff first). `evergreen setup` does the same for every detected host at once (Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot, Kilo Code), writing each host's own instruction file such as `.cursor/rules/evergreen.mdc` after confirmation or `--yes`; it does not edit MCP server entries, which stay in the per-host setups above.

Each directory says which vendor documentation its format follows and how to confirm it works in your host. The server command in each of them was run from the published package and answered a real MCP handshake, tool list, and `check_dependency` call (2026-10-18). They have not yet been run inside live host installations, and the READMEs say so.

## Agent workflow

1. Call `scan_repository` or `list_deprecations` before editing.
2. Use `explain_deprecation` to inspect evidence and lifecycle details.
3. Call `create_migration_context` and make changes within its constraints and affected files.
4. Run the packet's suggested project commands when appropriate.
5. Call `verify_migration` in the same MCP session.

Verification is deliberately conservative. Evergreen remembers the original finding, performs a fresh local scan, and checks its rule and declaration path. An unknown finding ID returns an error rather than a false success. `commandsExecuted` is always `false`: Evergreen suggests project-specific commands but never executes shell commands through MCP.

## Privacy and trust

- Repository traversal, parsing, matching, context creation, and verification happen inside the local Evergreen process.
- Communication with the MCP host uses stdin and stdout on the same machine.
- The server has no HTTP transport and makes no outbound requests.
- No hosted Evergreen service, telemetry, account, or API key is involved.
- Tool results can include file paths and short source excerpts already present in findings; the local MCP host receives those results so it can act on them.

The versioned JSON contracts live in `schemas/scan.v1.schema.json`, `schemas/deprecations.v1.schema.json`, `schemas/context.v1.schema.json`, and `schemas/verification.v1.schema.json`.
