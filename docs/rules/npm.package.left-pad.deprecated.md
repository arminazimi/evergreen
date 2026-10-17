---
title: "left-pad is deprecated"
description: "The package author recommends the built-in String.prototype.padStart method."
---

# left-pad is deprecated

The package author recommends the built-in String.prototype.padStart method.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/left-pad` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | String.prototype.padStart() |
| Evidence last seen | 2026-10-13 |
| Reviewed | 2026-10-14 by arminazimi |
| Review due | 2027-10-14 (365 days after the last review) |
| Rule ID | `npm.package.left-pad.deprecated` |

## Sources

- [left-pad package deprecation notice](https://www.npmjs.com/package/left-pad)

## Migration

**Constraints**

- Preserve target width, fill-string behavior, string coercion, and handling of values already wider than the requested length.

**Steps**

1. **Replace left-pad calls.** Convert each reported call to String(value).padStart(length, fill) while preserving existing coercion and defaults.
2. **Remove the dependency.** Delete left-pad from package metadata and refresh the lockfile.

**Verification**

- `npm run test --if-present`: Run padding edge cases and repository tests when defined.
- `npm run build --if-present`: Verify the project builds without left-pad.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.left-pad.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
