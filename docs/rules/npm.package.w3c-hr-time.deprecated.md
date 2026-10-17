---
title: "w3c-hr-time is deprecated"
description: "npm directs users of w3c-hr-time to native performance.now() and performance.timeOrigin."
---

# w3c-hr-time is deprecated

npm directs users of w3c-hr-time to native performance.now() and performance.timeOrigin.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/w3c-hr-time` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | Native performance.now() and performance.timeOrigin |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.w3c-hr-time.deprecated` |

## Sources

- [w3c-hr-time package deprecation notice](https://www.npmjs.com/package/w3c-hr-time)
- [w3c-hr-time registry metadata](https://registry.npmjs.org/w3c-hr-time/latest)

## Migration

**Constraints**

- Preserve monotonic timing, time-origin assumptions, units, precision expectations, and minimum-runtime support.

**Steps**

1. **Use native high-resolution time.** Replace w3c-hr-time imports and clock reads with native performance.now() and performance.timeOrigin, then remove the dependency.

**Verification**

- `npm run test --if-present`: Run timing behavior and repository tests without relying on exact wall-clock values.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.w3c-hr-time.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
