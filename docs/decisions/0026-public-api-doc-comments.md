# 0026 — Document the public API on declarations and enforce it with lint

Status: accepted

## Problem

The package surface — `src/index.ts`, `src/sdk.ts`, `src/conformance/index.ts`, and `src/mcp.ts` — exports 78
symbols, and 71 of them had no doc comment. The generated declarations, editors, and agents therefore had to
read an implementation to learn what a public symbol does. Nothing stopped a new public symbol from landing
without a description.

## Decision

1. Every symbol exported from the package entry points carries a doc comment on the declaration that defines it.
   An entry point that re-exports a symbol leaves the comment on the declaration.
2. The comment states behavior and does not repeat the name.
3. A local ESLint rule, `local/public-api-docs`, reads the entry points from `package.json` `exports`, follows
   direct exports and re-exports, and fails a missing comment or one that only restates the name.
4. The rule covers the public surface only. Internal exports keep the existing review expectations.

The change is documentation only. It does not alter a signature, a published schema, CLI output, or an MCP
tool shape.

## Consequences

- `npm run check` runs the rule through the existing lint step.
- Adding an entry point to `package.json` `exports` extends the check to its symbols without another rule.
- `docs/CODE_STYLE.md` records the convention and its enforcement.
