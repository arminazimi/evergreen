---
title: "lodash.isequal is deprecated"
description: "npm recommends replacing lodash.isequal with node:util.isDeepStrictEqual."
---

# lodash.isequal is deprecated

npm recommends replacing lodash.isequal with node:util.isDeepStrictEqual.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/lodash.isequal` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | node:util.isDeepStrictEqual |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.lodash-isequal.deprecated` |

## Sources

- [lodash.isequal package deprecation notice](https://www.npmjs.com/package/lodash.isequal)
- [lodash.isequal registry metadata](https://registry.npmjs.org/lodash.isequal/latest)

## Migration

**Constraints**

- Confirm compatibility for prototypes, boxed primitives, Maps, Sets, typed arrays, symbols, circular references, and cross-realm values.

**Steps**

1. **Compare equality semantics.** Identify value types used at each call site and confirm node:util.isDeepStrictEqual has acceptable semantics.
2. **Use Node deep strict equality.** Replace lodash.isequal imports and calls with node:util.isDeepStrictEqual, then remove the dependency.

**Verification**

- `npm run test --if-present`: Run deep-equality edge cases and repository tests.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.lodash-isequal.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
