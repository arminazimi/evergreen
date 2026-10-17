---
title: "istanbul is deprecated"
description: "npm states that istanbul is no longer maintained and recommends nyc."
---

# istanbul is deprecated

npm states that istanbul is no longer maintained and recommends nyc.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/istanbul` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | nyc |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.istanbul.deprecated` |

## Sources

- [istanbul package deprecation notice](https://www.npmjs.com/package/istanbul)
- [istanbul registry metadata](https://registry.npmjs.org/istanbul/latest)

## Migration

**Constraints**

- Preserve test execution, include and exclude patterns, source maps, reporters, and coverage thresholds.

**Steps**

1. **Replace Istanbul CLI.** Replace istanbul with nyc in dependencies, scripts, and coverage configuration.
2. **Compare coverage output.** Run the same test suite and compare covered files, reporters, and enforced thresholds.

**Verification**

- `npm run test --if-present`: Run the instrumented test suite and coverage checks.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.istanbul.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
