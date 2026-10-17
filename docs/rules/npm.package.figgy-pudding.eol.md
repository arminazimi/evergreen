---
title: "figgy-pudding is no longer supported"
description: "npm states that the figgy-pudding module is no longer supported."
---

# figgy-pudding is no longer supported

npm states that the figgy-pudding module is no longer supported.

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `npm` |
| Component | `pkg:npm/figgy-pudding` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.figgy-pudding.eol` |

## Sources

- [figgy-pudding package deprecation notice](https://www.npmjs.com/package/figgy-pudding)
- [figgy-pudding registry metadata](https://registry.npmjs.org/figgy-pudding/latest)

## Migration

**Constraints**

- Preserve option defaults, validation, inheritance, provider lookup, key enumeration, and sensitive-value handling.

**Steps**

1. **Replace configuration wrappers.** Replace figgy-pudding instances with explicit validated configuration objects or a maintained configuration library, then remove the package.

**Verification**

- `npm run test --if-present`: Run configuration defaults, validation, inheritance, and repository tests.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.figgy-pudding.eol`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
