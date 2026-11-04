# 0028 — Publish a self-contained MCP output schema and fail closed on a dangling `$ref`

Status: accepted

## Problem

`src/mcp.ts` advertises, for each of the eleven tools, the published JSON Schema its structured content conforms
to. The schemas live as sibling files under `schemas/` and reference each other, for example
`scan.v1.schema.json#/properties/findings/items`. A MCP client reads the advertised schema on its own and cannot
fetch a sibling file, so what the server publishes must not depend on one: `inlineSchemaReferences` replaces every
cross-file `$ref` with the schema it points to before the server hands the document out.

That walk has to decide what happens when a reference does not resolve. Making a type-only change under `src/mcp.ts`
(issue #2246, removing the file's non-null assertions) touches a contract path, so the rule this record states is the
one that was already in force; the change alters no signature, no published schema, and no MCP tool shape.

## Options compared

| Option | What it does | Cost |
| --- | --- | --- |
| Fail closed | Throw with the referring file and the reference. | The server refuses to start on a broken `schemas/` tree. |
| Skip the reference | Leave the `$ref` in the published document. | Silent: clients get a schema they cannot resolve, exactly the bug the walk exists to remove. |
| Substitute an empty object | Publish `{}` in place of the unreachable subtree. | The document validates anything, so a client believes it read the contract. |
| Resolve lazily per request | Inline during each `tools/list`. | Same result, slower, and a broken reference becomes a runtime failure per client instead of a startup failure. |

## Decision

1. **Keep the eager, fail-closed walk.** A `$ref` to another file that does not resolve throws
   `` `${file}: cannot resolve ${reference}` `` while the schema is being prepared, so an unusable server never starts.
2. **Keep same-document references (`#/$defs/...`) intact.** Only cross-file references are inlined; a reference
   inside one document still resolves there.
3. **Sibling keywords win over the target.** Sibling keywords such as `description` on the referring node are merged
   over the inlined schema, so a tool can narrow the prose without editing the shared file.
4. **Reads inside the walk are checked, not asserted.** The reference is split into a file and a pointer, and each
   part is read through the same checked access the rest of the codebase uses. The split always yields a first
   element, so the check cannot fire for a well-formed `$ref`; it fails loudly if one ever is.

## Why

- **A client cannot ask for help.** Skipping a reference or publishing `{}` produces a document that looks fine in
  the tool list and is wrong at the first payload. A thrown error names the file and the reference, which is the
  shortest path to a fix.
- **The alternative is silent drift.** The published document is the contract; anything that lets it point at a file
  the client cannot read turns a schema review into a guessing game.
- **Startup is the right moment.** The schemas are packaged with the server and change only in a pull request, so an
  unresolvable reference is a build-time defect and belongs in a build-time failure.

## Consequences

- `schemas/` files must stay resolvable from each other; a rename that breaks a cross-file `$ref` fails at server
  start rather than in a client.
- The `docs/decisions/` gate keeps a contract-path change such as #2246 reviewable: this record states the rule
  that change leaves in force.
- No new dependency, no network use, and no change to any tool's input or output shape.
