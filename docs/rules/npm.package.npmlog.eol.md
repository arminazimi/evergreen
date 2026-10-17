---
title: "npmlog is no longer supported"
description: "npm states that the npmlog package is no longer supported."
---

# npmlog is no longer supported

npm states that the npmlog package is no longer supported.

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `npm` |
| Component | `pkg:npm/npmlog` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.npmlog.eol` |

## Sources

- [npmlog package deprecation notice](https://www.npmjs.com/package/npmlog)
- [npmlog registry metadata](https://registry.npmjs.org/npmlog/latest)

## Migration

**Constraints**

- Preserve log levels, prefixes, headings, progress integration, stream routing, formatting, and quiet-mode behavior.

**Steps**

1. **Replace npmlog.** Select a maintained logger that covers the used behavior, translate configuration and calls, then remove npmlog.

**Verification**

- `npm run test --if-present`: Run logging output, level filtering, and repository tests.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.npmlog.eol`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
