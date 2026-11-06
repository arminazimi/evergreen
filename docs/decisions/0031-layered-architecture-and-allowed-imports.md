# 0031 — Layered architecture and the allowed-imports table

Status: proposed; accepted when the maintainer merges the pull request for #2087.

## Problem

`src/` holds about 400 TypeScript files. [AGENTS.md](../../AGENTS.md) names six layers, and
`tools/check-architecture.ts` enforces five narrow rules between them. Most of the tree sits outside any named
layer: many top-level modules (`config.ts`, `baseline.ts`, `plan.ts`, `fix/`, `sbom/`, and others) have no
declared place, so nothing stops a new module from reaching across a boundary. Four import cycles are
baselined, and `src/engine.ts` and `src/source-usage.ts` import `node:fs` directly. The follow-up issues of
epic #1990 (cycles #2090, pure core #2091, detector contract #2092, adapters #2093, errors #2094, reporters
#2114, fitness tests #2115) each need one agreed target to move toward.

This record fixes that target. It moves no code and changes no behavior.

## Decision

Evergreen is one package with seven layers. A module belongs to exactly one layer. A layer may import only the
layers listed for it below, plus the `node:` built-ins and packages listed for it. Imports between modules of
the same layer are allowed unless a later record narrows them.

### Layers

| Layer | Lives in | Owns |
|---|---|---|
| 1. Domain | `src/domain.ts`, `src/errors.ts`, `src/purl.ts`, `src/vers/`, `src/paths.ts` | Types, output contracts, pure helpers with no I/O |
| 2. Detector SDK | `src/sdk.ts` | The public seam: API version, stable ID, one `scan` operation |
| 3. Core | `src/engine.ts`, `src/source-usage.ts`, `src/usage/`, `src/registry.ts`, `src/scan-cache.ts`, `src/detector-inputs.ts` | Detector attribution, sorting, repository traversal, usage matching, rule loading |
| 4. Detectors | `src/detectors/` | Reading manifests and lockfiles for one ecosystem |
| 5. Services | analysis built on a scan result: `src/plan*.ts`, `src/migration-*.ts`, `src/fix/`, `src/sbom/`, `src/drift/`, `src/export/`, `src/inventory/`, `src/baseline.ts`, `src/diff.ts`, `src/forecast*.ts`, `src/receipt*.ts`, `src/agent-tools.ts`, and similar | Migration context, plans, baselines, exports. No argument parsing, no host protocol |
| 6. Reporters | `src/reporters.ts`, `src/reporters/`, `src/mermaid.ts` | Turning results into text, JSON, SARIF, HTML, and other formats |
| 7. Adapters | `src/cli.ts`, `src/cli-main.ts`, `src/commands/`, `src/mcp*.ts`, `src/lsp.ts`, `src/action*.ts`, `src/github-action.ts`, `src/tui.ts`, `skills/`, `plugins/` | Translating one host interface to services and reporters |

Registry data (`registry/*.json`) is data, not a layer. It holds no logic, and only the core loads it.

### Allowed imports

Read a row as "the layer in the first column may import the layers marked ✓".

| Importer \ Imported | Domain | SDK | Core | Detectors | Services | Reporters | Adapters |
|---|---|---|---|---|---|---|---|
| 1. Domain | ✓ | | | | | | |
| 2. Detector SDK | ✓ | ✓ | | | | | |
| 3. Core | ✓ | ✓ | ✓ | | | | |
| 4. Detectors | ✓ | ✓ | `source-usage` and `usage/` only | ✓ | | | |
| 5. Services | ✓ | ✓ | ✓ | | ✓ | | |
| 6. Reporters | ✓ | | | | ✓ (types and helpers only) | ✓ | |
| 7. Adapters | ✓ | ✓ | ✓ | ✓ (through `scan-builtins.ts` only) | ✓ | ✓ | ✓ |

Notes on the table:

- **Core never imports detectors.** Built-in detectors reach the engine only through `src/scan-builtins.ts`,
  which an adapter or service calls. This is the existing `engine-no-detectors` rule.
- **Detectors may use the shared usage matcher** (`source-usage.ts`, `usage/`) because it is the shared pass
  they declare patterns for. They may not import services, reporters, or adapters.
- **Reporters sit below adapters and render services' output.** A reporter does not run a scan.
- **Nothing imports an adapter except another adapter.** An adapter file that other layers need to import is
  a sign that logic belongs in a service.
- **The SDK depends only on the domain layer**, except that it re-exports `analyzeSourceUsage` from
  `source-usage.ts` today. #2092 removes that exception by exposing detectors' usage access through the
  detector contract instead.

### Runtime access rules

| Rule | Applies to |
|---|---|
| No `node:fs`, `node:fs/promises`, `node:child_process`, `node:http`, `node:https`, `node:net`, `node:tls`, `node:dgram`, `node:dns`, or global `fetch` | Domain, SDK, and core, after #2091 moves file access behind an interface |
| No network modules or `fetch` | Detectors and reporters. This is the scan-offline guarantee. |
| Network use is allowed only in the named update and publishing modules that exist today (`data-update.ts`, `pr-comment.ts`, `action-fix-pr.ts`, `action-tracking-issue.ts`, `commands/data.ts`) | Services and adapters; never reachable from a scan |
| No `eval`, `new Function`, `vm`, or dynamic `import()` of repository paths | Every layer. Repository contents are parsed, never executed. |

### How the checker adopts this

The decision does not change the checker. Each follow-up lands its own rule in `tools/check-architecture.ts`
with the code move that makes it true, so the check never fails on code that has not moved yet:

1. #2090 empties `tools/architecture-baseline.json`, so a new cycle fails with no exception list.
2. #2091 adds the no-`node:fs`/no-network rule for domain, SDK, and core.
3. #2092 gives detectors one typed contract and removes the SDK's import of `source-usage.ts`.
4. #2093 moves logic out of adapters and adds "nothing imports an adapter except an adapter".
5. #2114 gives reporters one interface and adds the reporters row.
6. #2115 turns this table into fitness tests with a clear message per rule.

## Alternatives considered

- **Separate workspace packages per layer.** Rejected for now, for the reason already in
  [ARCHITECTURE.md](../ARCHITECTURE.md): interface and implementation share one release lifecycle, and a
  package boundary would add publishing work without adding a check that an import rule does not already give.
- **Keep only the five existing rules.** Rejected: most modules have no declared layer, so the checker cannot
  say whether a new import is wrong.
- **Forbid same-layer imports.** Rejected as too strict for services, where `plan.ts` legitimately builds on
  `plan-build.ts` and `plan-waves.ts`. Cycles are forbidden separately by #2090.

## Consequences

- Every module has one layer, and a reviewer can answer "may this import that?" from one table.
- The AGENTS.md table stays the short summary and links here for the full rules.
- Layers 5 and 7 are described by file patterns because the modules are still flat in `src/`. Moving them into
  directories is optional and not required by this decision.
- Until the follow-ups land, the checker enforces less than this record states. The record is the target;
  the checker is the floor.

## Review

Revisit after #2115 lands, when every row has a test, or when a module cannot be placed in one layer.
