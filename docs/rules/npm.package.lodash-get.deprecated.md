---
title: "lodash.get is deprecated"
description: "npm recommends replacing lodash.get with JavaScript's optional chaining operator."
---

# lodash.get is deprecated

npm recommends replacing lodash.get with JavaScript's optional chaining operator.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/lodash.get` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | Optional chaining (?.) |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.lodash-get.deprecated` |

## Sources

- [lodash.get package deprecation notice](https://www.npmjs.com/package/lodash.get)
- [lodash.get registry metadata](https://registry.npmjs.org/lodash.get/latest)

## Migration

**Constraints**

- Preserve path semantics, array-index access, default-value behavior, nullish handling, and minimum-runtime support.

**Steps**

1. **Use optional chaining.** Rewrite each lodash.get call with optional chaining and nullish coalescing where a default value is required, then remove the dependency.

**Verification**

- `npm run test --if-present`: Run nested access, default-value, nullish, and repository tests.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.lodash-get.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
