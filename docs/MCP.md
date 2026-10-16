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

The exact settings location depends on the host. Evergreen needs no environment variables or credentials.

## Tools

| Tool | Purpose |
| --- | --- |
| `scan_repository` | Return the complete `evergreen.scan.v1` result from all built-in detectors. |
| `list_deprecations` | Return a compact `evergreen.deprecations.v1` list for planning. |
| `explain_deprecation` | Return one evidence-backed finding by exact ID. |
| `create_migration_context` | Return a validated `evergreen.context.v1` migration packet. |
| `verify_migration` | Re-scan and return `evergreen.verification.v1` for a finding observed earlier in the session. |
| `check_dependency` | Check one package, and optionally one version, before adding it. Takes a `purl` (and optionally `version`), reads no repository, and returns `evergreen.check.v1`. |

Every tool except `check_dependency` accepts `repository_path`; it defaults to the server's current working directory. Finding-specific tools also require the exact `finding_id` returned by Evergreen.

## Checking a dependency before adding it

Call `check_dependency` with a Package URL (`pkg:npm/request@2.88.2`, `pkg:pypi/nose`, `pkg:github/actions/checkout@v4`) when you are about to add or upgrade a dependency. The result has a `status`:

- `affected`: a rule applies. Read `findings[].summary`, `replacement`, and `sources`, and choose the replacement instead.
- `version-dependent`: rules exist, but only for some versions. Call again with the version you intend to use.
- `not-affected`: rules exist and none covers that version.
- `no-data`: Evergreen has no rule for the package. That is absence of evidence, not a safety claim.

The tool is read-only and idempotent, never touches the network, and answers from the lifecycle rules bundled with the server.

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
