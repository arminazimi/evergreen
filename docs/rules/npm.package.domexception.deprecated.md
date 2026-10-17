---
title: "domexception is deprecated"
description: "npm directs users of domexception to the platform-native DOMException implementation."
---

# domexception is deprecated

npm directs users of domexception to the platform-native DOMException implementation.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/domexception` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | Native DOMException |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.domexception.deprecated` |

## Sources

- [domexception package deprecation notice](https://www.npmjs.com/package/domexception)
- [domexception registry metadata](https://registry.npmjs.org/domexception/latest)

## Migration

**Constraints**

- Preserve exception names, messages, codes where consumed, instanceof checks, serialization, and minimum-runtime support.

**Steps**

1. **Use native DOMException.** Replace domexception imports and constructors with the global DOMException implementation, then remove the dependency.

**Verification**

- `npm run test --if-present`: Run exception behavior and repository tests.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.domexception.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
