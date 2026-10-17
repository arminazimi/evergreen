---
title: "gauge is no longer supported"
description: "npm states that the gauge package is no longer supported."
---

# gauge is no longer supported

npm states that the gauge package is no longer supported.

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `npm` |
| Component | `pkg:npm/gauge` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.gauge.eol` |

## Sources

- [gauge package deprecation notice](https://www.npmjs.com/package/gauge)
- [gauge registry metadata](https://registry.npmjs.org/gauge/latest)

## Migration

**Constraints**

- Preserve terminal detection, redraw behavior, themes, templates, progress values, status sections, and non-TTY output.

**Steps**

1. **Replace the terminal gauge.** Select a maintained terminal progress implementation, migrate rendering and update calls, then remove gauge.

**Verification**

- `npm run test --if-present`: Run TTY, non-TTY, redraw, and repository tests.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.gauge.eol`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
