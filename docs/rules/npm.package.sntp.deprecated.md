---
title: "sntp is deprecated"
description: "npm states that sntp moved to @hapi/sntp and that the old distribution is no longer supported."
---

# sntp is deprecated

npm states that sntp moved to @hapi/sntp and that the old distribution is no longer supported.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | high |
| Ecosystem | `npm` |
| Component | `pkg:npm/sntp` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | @hapi/sntp |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.sntp.deprecated` |

## Sources

- [sntp package deprecation notice](https://www.npmjs.com/package/sntp)
- [sntp registry metadata](https://registry.npmjs.org/sntp/latest)

## Migration

**Constraints**

- Preserve server selection, timeout behavior, clock-offset calculations, error handling, and any security-sensitive time checks.

**Steps**

1. **Replace sntp.** Move the dependency and imports from sntp to @hapi/sntp and adapt changed APIs.
2. **Verify network-time behavior.** Test successful queries, timeouts, invalid responses, and clock-offset handling with controlled fixtures.

**Verification**

- `npm run test --if-present`: Run time synchronization and repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.sntp.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
