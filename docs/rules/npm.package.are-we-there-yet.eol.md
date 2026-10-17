---
title: "are-we-there-yet is no longer supported"
description: "npm states that the are-we-there-yet package is no longer supported."
---

# are-we-there-yet is no longer supported

npm states that the are-we-there-yet package is no longer supported.

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `npm` |
| Component | `pkg:npm/are-we-there-yet` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.are-we-there-yet.eol` |

## Sources

- [are-we-there-yet package deprecation notice](https://www.npmjs.com/package/are-we-there-yet)
- [are-we-there-yet registry metadata](https://registry.npmjs.org/are-we-there-yet/latest)

## Migration

**Constraints**

- Preserve weighted completion, nested tracker groups, stream progress, event timing, and completion semantics.

**Steps**

1. **Replace progress tracking.** Select a maintained progress tracker or implement the required aggregation locally, migrate tracker construction and updates, then remove the package.

**Verification**

- `npm run test --if-present`: Run nested progress, completion, event, and repository tests.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.are-we-there-yet.eol`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
