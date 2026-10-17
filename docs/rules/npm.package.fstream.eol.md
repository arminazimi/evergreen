---
title: "fstream is no longer supported"
description: "npm states that the fstream package is no longer supported."
---

# fstream is no longer supported

npm states that the fstream package is no longer supported.

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `npm` |
| Component | `pkg:npm/fstream` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.fstream.eol` |

## Sources

- [fstream package deprecation notice](https://www.npmjs.com/package/fstream)
- [fstream registry metadata](https://registry.npmjs.org/fstream/latest)

## Migration

**Constraints**

- Preserve filesystem traversal, filtering, permissions, ownership, symlink handling, stream backpressure, and archive boundary security.

**Steps**

1. **Replace filesystem streaming.** Select maintained filesystem and archive primitives for the used fstream behavior, migrate readers and writers, then remove fstream.

**Verification**

- `npm run test --if-present`: Run files, directories, symlinks, permissions, errors, and repository tests.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.fstream.eol`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
