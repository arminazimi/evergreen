# MCP directory listings

Where the Evergreen MCP server appears in public directories, how each listing stays current, and which account owns it. The weekly workflow [`.github/workflows/mcp-listings.yml`](../.github/workflows/mcp-listings.yml) fetches every checkable listing and compares the shown version to [`server.json`](../server.json). Scans never use these URLs.

Status below matches [Where the server is listed](MCP.md#where-the-server-is-listed). Sibling tasks under epic #1606 submit or claim the rows that are not listed yet; this page only tracks them.

| Directory | Listing URL | How it updates | Account owner | Check |
| --- | --- | --- | --- | --- |
| Official MCP Registry | https://registry.modelcontextprotocol.io/v0/servers?search=evergreen | Republished per release by the `registry` job in [`publish.yml`](../.github/workflows/publish.yml) from `server.json` | `arminazimi` GitHub (OIDC / `mcp-publisher`) | Fetches `/v0/servers/io.github.arminazimi%2Fevergreen/versions/latest` |
| GitHub MCP Registry | https://github.com/mcp/arminazimi/evergreen | Manual onboarding, then versions sync from the official Registry | GitHub curation; request from `arminazimi` | HTTP status of the listing URL (404 = not onboarded) |
| VS Code / Copilot MCP gallery | https://github.com/mcp/arminazimi/evergreen | Same GitHub MCP Registry entry; no separate publish step | Same as GitHub MCP Registry | Same check as GitHub MCP Registry |
| Docker MCP Catalog | https://hub.docker.com/mcp | PR to [docker/mcp-registry](https://github.com/docker/mcp-registry); catalog pins a commit in `servers/evergreen/server.yaml` | `arminazimi` GitHub (upstream PR author) | Raw `servers/evergreen/server.yaml` on `main` when present |
| Glama | https://glama.ai/mcp/servers/arminazimi/evergreen | Continuous re-index of public MCP servers; claim needs a browser sign-in | Maintainer Glama account (`arminazimi`) | Listing page body for a semver |
| PulseMCP | https://www.pulsemcp.com | Ingests the official Registry when submissions reopen | None yet (paused) | Skipped until listed |
| mcp.so | https://mcp.so | Maintainer form submission; review queue | Maintainer mcp.so account | Skipped until listed |
| Smithery | https://smithery.ai | Not pursued (HTTP/MCPB focus; publishing flow shut down) | — | Skipped |
| Cursor Directory | https://cursor.directory | Not pursued (plugin gallery, not stdio-only servers) | — | Skipped |
| Cline MCP Marketplace | https://cline.bot/mcp-marketplace | GitHub issue on [cline/mcp-marketplace](https://github.com/cline/mcp-marketplace) | `arminazimi` GitHub | Skipped until listed |
| MCP Market | https://mcpmarket.com | Maintainer submission (epic #1611) | Maintainer account | Skipped until listed |
| LobeHub | https://lobehub.com/mcp | Maintainer submission (epic #1611) | Maintainer account | Skipped until listed |
| awesome-mcp-servers | https://github.com/punkpeye/awesome-mcp-servers | Upstream PR (epic #1616) | `arminazimi` GitHub | Skipped until listed |
| mcpservers.org | https://mcpservers.org | Upstream listing (epic #1616) | Maintainer account | Skipped until listed |

When the weekly check finds a listing whose shown version differs from `server.json`, it writes the mismatches into the job summary and opens one tracking issue (or updates the open one) so a maintainer can republish or chase the directory.
