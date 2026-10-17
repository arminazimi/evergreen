---
title: "stable is deprecated"
description: "npm states that modern JavaScript engines already provide stable Array.prototype.sort behavior, so the stable package is deprecated."
---

# stable is deprecated

npm states that modern JavaScript engines already provide stable Array.prototype.sort behavior, so the stable package is deprecated.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/stable` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | Array.prototype.sort |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.stable.deprecated` |

## Sources

- [stable package deprecation notice](https://www.npmjs.com/package/stable)
- [stable registry metadata](https://registry.npmjs.org/stable/latest)

## Migration

**Constraints**

- Preserve comparator behavior, input mutation, output ordering, and support for the project's minimum JavaScript runtime.

**Steps**

1. **Use native stable sorting.** Replace stable package calls with Array.prototype.sort using the same comparator, then remove the dependency.

**Verification**

- `npm run test --if-present`: Run ordering and repository tests on every supported runtime.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.stable.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
