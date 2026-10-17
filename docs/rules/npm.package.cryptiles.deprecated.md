---
title: "cryptiles is deprecated"
description: "npm states that cryptiles moved to @hapi/cryptiles and that the old distribution is no longer maintained."
---

# cryptiles is deprecated

npm states that cryptiles moved to @hapi/cryptiles and that the old distribution is no longer maintained.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/cryptiles` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | @hapi/cryptiles |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.cryptiles.deprecated` |

## Sources

- [cryptiles package deprecation notice](https://www.npmjs.com/package/cryptiles)
- [cryptiles registry metadata](https://registry.npmjs.org/cryptiles/latest)

## Migration

**Constraints**

- Preserve random-token entropy, timing-safe comparisons, and cryptographic input and output encodings.

**Steps**

1. **Replace cryptiles.** Move the dependency and imports from cryptiles to @hapi/cryptiles and adapt changed APIs.
2. **Verify cryptographic behavior.** Exercise token generation and comparison paths with their existing encodings and lengths.

**Verification**

- `npm run test --if-present`: Run security-sensitive behavior and repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.cryptiles.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
