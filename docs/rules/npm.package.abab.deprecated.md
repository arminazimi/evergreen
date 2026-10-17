---
title: "abab is deprecated"
description: "npm directs users of abab to the platform-native atob and btoa functions."
---

# abab is deprecated

npm directs users of abab to the platform-native atob and btoa functions.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/abab` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | Native atob() and btoa() |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.abab.deprecated` |

## Sources

- [abab package deprecation notice](https://www.npmjs.com/package/abab)
- [abab registry metadata](https://registry.npmjs.org/abab/latest)

## Migration

**Constraints**

- Preserve accepted input, binary-string output, thrown errors, Unicode handling, and support for the project's minimum runtime.

**Steps**

1. **Use platform Base64 functions.** Replace abab imports and calls with the runtime's native atob and btoa functions, then remove the dependency.

**Verification**

- `npm run test --if-present`: Run Base64 edge-case and repository tests.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.abab.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
