# Declaring lifecycle for your package

Package maintainers can ship a [CLE (ECMA-428)](https://ecma-international.org/publications-and-standards/standards/ecma-428/) document inside their published package. Evergreen reads that file offline from installed dependencies and reports matching lifecycle events as findings, with the CLE document as evidence.

## What to ship

1. Add a `cle.json` file at the **package root** (next to `package.json`), and include it in the published tarball (`files` in `package.json`, or do not `.npmignore` it).
2. Set `$schema` to `https://tc54.org/schemas/cle/cle-1.0.0.schema.json`.
3. Set `identifier` to the package’s Package URL without a version, for example `pkg:npm/your-package` or `pkg:npm/%40scope/your-package`.
4. List dated events with VERS ranges for the versions they apply to. Evergreen reports `endOfSupport`, `endOfLife`, `endOfDevelopment`, and `endOfDistribution` when the installed version matches a range.

Minimal example:

```json
{
  "$schema": "https://tc54.org/schemas/cle/cle-1.0.0.schema.json",
  "identifier": "pkg:npm/legacy-widget",
  "updatedAt": "2024-06-01T00:00:00Z",
  "definitions": {
    "support": [
      {
        "id": "standard",
        "description": "Standard product support for the 1.x line."
      }
    ]
  },
  "events": [
    {
      "id": 1,
      "type": "endOfLife",
      "effective": "2024-01-01T00:00:00Z",
      "published": "2023-06-01T00:00:00Z",
      "versions": [{ "range": "vers:npm/<2.0.0" }],
      "description": "The 1.x line is end of life; migrate to 2.x.",
      "references": ["https://example.com/legacy-widget/eol"]
    }
  ]
}
```

## How Evergreen uses it

- Scans look under `node_modules` only. They never fetch CLE over the network.
- The CLE `identifier` must match the installed package name (as a PURL). A mismatched document is ignored.
- The installed `package.json` version must fall in an event’s VERS range.
- Each finding points at the shipped `cle.json`, cites it as a maintainer declaration, and keeps any `http(s)` `references` from the event as extra evidence.
- Severity follows decision 0010 using the scan timestamp (not a live clock read inside the detector): when `effective` is still in the future, the finding is reported as scheduled at severity `low` and keeps its `deadline`; when `effective` is on or before the scan time, severity is by event type (`endOfLife` / `endOfDistribution` → high; `endOfSupport` / `endOfDevelopment` → medium). Finding identity does not change with the clock.

Exporting Evergreen’s own registry as CLE snapshots is separate: `evergreen export --format cle`.

## What not to put in CLE

Do not invent lifecycle claims. CLE has no faithful representation for a soft deprecation that is not end of support, development, life, or distribution. Prefer an authoritative URL in `references` when one exists.

## README contributors list

The all-contributors badge and list were removed from the README while the project has fewer than ten contributors (#1658). When the repository reaches ten or more contributors, restore them (revert #1658, or re-apply what #1569 added): `.all-contributorsrc`, `tests/all-contributors.test.ts`, and the badge and Contributors section in `README.md`.
