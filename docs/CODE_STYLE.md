---
title: Code style
description: The naming and module layout conventions Evergreen follows, the check that enforces each one, and the few rules kept for review.
---

# Code style

This page records the naming and module layout conventions the code already follows. Each convention is either
enforced by `npm run check` (a lint rule in [`eslint.config.js`](../eslint.config.js) or the quality checker in
[`tools/check-quality.ts`](../tools/check-quality.ts)) or marked **review** for the pull request reviewer.

Formatting is not listed here. Biome decides whitespace, quotes, line width, and import layout in
[`biome.json`](../biome.json); the tool choice is [Decision 0025](decisions/0025-linter-and-formatter.md).

`npm run lint` reads `src/**/*.ts` and `tools/**/*.ts`. Tests, benchmarks, and examples follow the same conventions
by **review**; the lint patterns widen when a rule can land without a baseline.

## Files and directories

| Convention | Name | Enforcement |
| --- | --- | --- |
| Source and tool files are lowercase kebab-case: words separated by one hyphen. `source-usage.ts`, `check-quality.ts`. | `local/kebab-case-filename` | lint config |
| A capability module is named after the capability ID it implements: lowercase segments separated by dots. Only `src/capabilities/capabilities/` and `src/capabilities/surfaces/` use dotted names. `deprecation.list.ts`, `ci.github-actions.ts`. | `local/kebab-case-filename` exception | lint config |
| Generated files keep their generated name and are regenerated, never renamed by hand. `index.generated.ts`. | generation check | `npm run check` |
| A subsystem that owns several modules is a directory under `src/`: `src/detectors/<ecosystem>/`, `src/fix/codemods/`, `src/vers/`. A single-purpose module stays a file at the level where it is used. | — | review |
| A subsystem directory groups files that do the same job. When it publishes a combined surface, that surface is `index.ts` (`src/detectors/index.ts`, `src/fix/index.ts`); otherwise callers import the exact module they need. | — | review |
| One responsibility per module: the file name states what the module does (one detector, fixer, command, or reporter), and supporting helpers stay in the module or in a sibling parser file. | — | review |
| Tests live under `tests/`, named `<area>.test.ts` after the module or behavior they cover. Fixtures live beside the test (`tests/fixtures/`) and are data, never executable repository code. | — | review |

## Naming

| Kind | Convention | Enforcement |
| --- | --- | --- |
| Types, interfaces, classes, type parameters | PascalCase. `ScanResult`, `HostAdapter`, `T`. | `@typescript-eslint/naming-convention` (`typeLike`) |
| Functions, methods, parameters, local variables | camelCase. A leading underscore is allowed only for an intentionally unused parameter or local. | `@typescript-eslint/naming-convention` |
| Module-level constant holding a fixed value | UPPER_CASE. `ALLOWLIST_PATH`, `CHECK_TIMING_MARKER`. | partly: the rule allows camelCase or UPPER_CASE for variables; choosing between them is **review** |
| Exported singleton objects, schemas, arrays, and factories | camelCase, because the value is a thing or a function, not a literal constant. `builtInDetectors`, `capabilityManifestSchema`. | `@typescript-eslint/naming-convention`; the distinction from a fixed constant is **review** |
| Names taken from an external document | Keep the document's spelling. MCP tool inputs (`finding_id`), GitHub API responses (`tag_name`), and SPDX and CycloneDX fields are not renamed at the boundary. | not checked for type properties, object literal properties, and destructured names; otherwise **review** |
| Imported bindings | Keep the exported name. Rename only to avoid a collision or a reserved word. | **review** |

## Imports and exports

| Convention | Enforcement |
| --- | --- |
| Node.js built-in modules use the `node:` prefix: `node:fs`, `node:path`, `node:test`. | `local/node-protocol-imports` |
| Relative imports name the compiled file and end in `.js`: `./domain.js`. | TypeScript build (`NodeNext`) |
| Modules use named exports. Capability modules under `src/capabilities/` are the only default exports, because the capability registry imports them by ID. | `no-restricted-syntax` |
| A type-only import uses `import type` when every binding is a type, and an inline `type` specifier when a statement mixes values and types. | **review** |
| The package surface is exactly the entry points in `package.json` (`src/index.ts`, `src/sdk.ts`, `src/conformance/index.ts`, `src/mcp.ts`). Do not add an entry point without a decision record. | **review**; `exports` changes need a decision |

## Documentation

| Convention | Enforcement |
| --- | --- |
| Every symbol exported from the package entry points has a doc comment on its declaration. It states what the symbol does or represents; it does not repeat the name. The comment stays on the declaration even when the entry point re-exports the symbol. | `local/public-api-docs` |

The rule reads the entry points from `package.json` `exports`, follows direct exports and re-exports, and checks the
declarations they reach. It does not require a doc comment on internal exports.

## Module boundaries

The layer, trust, and network rules are in [Architecture](ARCHITECTURE.md#trust-boundaries) and
[AGENTS.md](../AGENTS.md#architecture-boundaries). `npm run check:quality` enforces the mechanical half: the engine
does not import built-in detectors, detectors never import the network, and adapters do not import detectors. The
"owns one job" half of each rule is **review**.

## When a convention does not fit

A one-off exception is a scoped comment naming the rule and the reason:

```ts
// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- parsing an untrusted response body
```

Do not widen a convention in this page to make one file pass, and do not add a blanket disable. An exception that
recurs belongs in the rule, the checker, or a follow-up issue, not in an unrelated pull request.
