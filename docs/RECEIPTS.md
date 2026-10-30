---
title: Verification receipts
---

# Verification receipts

A verification receipt is the deterministic record of what one change did to a repository's lifecycle findings: which a before/after comparison resolved, which remain, and which the change introduced. Evergreen builds it by comparing two scans. It never edits files and never runs a verification command.

```bash
evergreen receipt [path] --before <scan.json> [--format markdown|json] [--fail-on-introduced]
```

The default format is Markdown meant for a pull request body. `--format json` (or `--json`) prints the versioned `evergreen.receipt.v1` document. With `--fail-on-introduced`, the command exits `1` when the after scan reports findings the before scan did not.

Through the local MCP server, `verify_migration` can return the same receipt and `receipt_markdown` when the session already holds a before scan. See [Local MCP server](MCP.md).

## Reproduce one from `examples/demo`

Work on a copy of the demo so the repository tree stays unchanged. Scan first, save the report, remove the deprecated `request` dependency and its import, then ask for a receipt against the saved before scan:

```bash
npm ci
npm run build
cp -R examples/demo /tmp/evergreen-demo-receipt
node dist/src/cli.js scan /tmp/evergreen-demo-receipt --json > /tmp/evergreen-demo-before.json
```

In the copy, clear the `request` dependency and replace its usage:

```json
{
  "name": "evergreen-demo",
  "private": true,
  "engines": {
    "node": ">=18"
  },
  "dependencies": {}
}
```

```js
export function fetchStatus(url) {
  return fetch(url).then((response) => response.status);
}
```

Write those contents to `package.json` and `src/client.js`, then:

```bash
node dist/src/cli.js receipt /tmp/evergreen-demo-receipt --before /tmp/evergreen-demo-before.json
```

That produces the Markdown below. Add `--format json` for the structured document.

## Example Markdown receipt

Real output from the steps above (Markdown escapes punctuation in titles and paths so the block stays paste-safe):

````markdown
<!-- evergreen-receipt -->
## Evergreen receipt: Partially resolved

| Resolved | Remaining | Introduced |
| --- | --- | --- |
| 1 | 4 | 0 |

### Resolved

| Severity | Finding | Location |
| --- | --- | --- |
| high | request is deprecated | package\.json:8 |

### Remaining

| Severity | Finding | Location |
| --- | --- | --- |
| high | Unsupported actions/checkout runtime | \.github/workflows/ci\.yml:9 |
| medium | Node\.js 18 is end\-of\-life | package\.json:5 |
| medium | Node\.js 19 is end\-of\-life | package\.json:5 |
| medium | Node\.js 20 is end\-of\-life | package\.json:5 |

### Introduced

_None._

### Suggested commands

```
git diff --check  # Validate the edited workflow diff.
node --version  # Confirm the active Node.js runtime is supported.
npm run build --if-present  # Verify imports, types, and the build remain valid.
npm run test --if-present  # Run HTTP behavior and repository tests when defined.
```
````

## What each section means

| Part | Meaning |
| --- | --- |
| `<!-- evergreen-receipt -->` | Marker so a tool can find or replace the block in a pull request body. |
| Heading verdict | Derived only from the counts: no findings, all resolved, findings remain, partially resolved, or new findings introduced. Introduced wins when any new finding appears. |
| Counts table | How many findings landed in each list. |
| Resolved | Present in the before scan and absent after. Matched by finding id. |
| Remaining | Present in both scans. |
| Introduced | Present only in the after scan. |
| Suggested commands | Verification commands named by the rules the comparison touched. Printed for the reader; Evergreen never runs them. |

When a list is empty, the section shows `_None._`. When a list has more than five findings, the Markdown collapses it into a `<details>` block.

## JSON contract

`--format json` prints the same comparison as `evergreen.receipt.v1`. The schema is [`schemas/receipt.v1.schema.json`](../schemas/receipt.v1.schema.json). Each finding entry keeps `id`, `rule`, `title`, `severity`, repository-relative `path`, and optional `line` — enough to join the finding in a `scan --json` report, not the whole finding. `data.before` and `data.after` record the lifecycle data each side used, or `null` when a scan did not.

The same two scans always produce the same receipt: comparison is by finding id, lists are sorted, and the builder reads no clock and no environment.

## Safety

`receipt` reads the `--before` scan file and re-scans the path locally. It does not use the network, does not evaluate repository code, and does not execute suggested commands. A migration is complete only after the project's own tests pass and a fresh scan no longer reports the findings you meant to clear.
