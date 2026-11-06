# 0032 — Split the MCP server into one file per tool with a small registry

Status: proposed; accepted when the maintainer merges the pull request for #2112.

## Problem

`src/mcp.ts` was 525 lines and held three jobs: it wired the server, its two resources, and its migration prompt;
it defined the input schema, description, handler, and error handling for all ten tools; and it exported the public
MCP surface. Adding or changing one tool meant editing a file that every other tool also lived in, so two people
working on different tools conflicted on the same lines, and a reviewer reading one tool's contract had to skip over
nine others. `createEvergreenMcpServer` alone measured 381 lines and was the largest function in the repository.

The issue (#2112) asks for one file per tool and a small registry. `src/mcp.ts` is a package entry point and a
public contract surface, so the split has to leave every export and every advertised tool schema exactly as it was.

## Options compared

| Option | What it does | Cost |
| --- | --- | --- |
| One file per tool, registry of registrars | Each tool owns its schema, description, handler, and errors in `src/mcp/tools/`; `src/mcp/registry.ts` lists them in order. | Ten small files and one registry line per tool. |
| Keep one file, extract only helpers | Move schema reading and `success`/`failure` out of `mcp.ts`. | The tool registrations still share 300 lines; the conflict and review problems remain. |
| One file per tool exporting a declarative config | Each tool exports a data object the registry interprets. | The registry has to type a heterogeneous array of Zod schemas and handlers; the inference fights the SDK's overloads, and each handler still needs the server and tools context. |
| Split by tool family | Group read-only checks, repository scans, and planning. | A family file still holds several tools, and the grouping has no meaning for readers. |

## Decision

1. **One file per tool under `src/mcp/tools/`.** Each file exports one `register*` function that calls
   `registerMcpTool` with the tool's name, title, description, input schema, and handler. The handler keeps the
   try/catch and the `sendResourceListChanged` call next to the work it protects.
2. **`src/mcp/registry.ts` is the whole list.** `MCP_TOOL_REGISTRARS` names the ten registrars in the advertised
   order; `registerMcpTools` loops over it. A new tool is one file plus one line.
3. **Shared code is explicit.** `src/mcp/tool-names.ts` holds the names, output-schema map, and annotations;
   `src/mcp/output-schema.ts` holds the fail-closed `$ref` inliner; `src/mcp/tool-support.ts` holds the shared
   inputs, `success`/`failure`, and the `registerMcpTool` seam.
4. **`src/mcp.ts` stays the entry point.** It keeps the server, resources, and migration prompt, re-exports
   `MCP_TOOL_NAMES`, `MCP_OUTPUT_SCHEMA_FILES`, `MCP_TOOL_ANNOTATIONS`, `inlineSchemaReferences`, and
   `toolOutputSchema`, and keeps `FINDING_URI_PREFIX` and `createEvergreenMcpServer`. Nothing the package exported
   before the split disappears.
5. **A snapshot proves the contract did not move.** `tests/mcp.test.ts` compares the complete `tools/list` result
   (names, titles, descriptions, input schemas, output schemas, annotations) with
   `tests/fixtures/mcp-tool-schemas.json`. The snapshot was generated from unmodified `main` before the split. Any
   later change to an advertised schema needs a deliberate golden update and shows up in review.

## Why

- **The type of each tool stays local.** A handler's input is inferred from its own Zod object; the registry only
  needs a function type, so there is no heterogeneous array to cast.
- **The public contract is unchanged.** The snapshot is generated before the move and passes after it, and the
  existing schema-validation test still compiles every advertised output schema.
- **The quality checker only improves.** `createEvergreenMcpServer` drops from 381 to 122 lines; its allowlist entry
  keeps the same owner and expiry and records the new measurement. The lint suppressions that belonged to the old
  file move to the files that now hold the same code; the baseline gains no new debt.
- **Imports point one way.** Tools import `tool-support`; the registry imports tools; `mcp.ts` imports the registry.
  There is no cycle, and no new adapter imports a detector.

## Consequences

- The number of files under `src/` grows by thirteen; each is well under the 800-line warning and has one job.
- `tools/check-architecture.ts` still lists only `src/mcp*.ts` as adapters. The new files are imported by `mcp.ts`
  and hold no detector or core logic, so they do not weaken a boundary rule, but a later change to an allowed-import
  table should add `src/mcp/` when that table starts covering directories.
- The snapshot is a golden file maintained with `UPDATE_GOLDEN=1`, the same convention as the drift golden. It is
  intentionally chatty: a one-word description edit changes it, which is the point.
