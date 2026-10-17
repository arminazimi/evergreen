---
title: "osenv is no longer supported"
description: "npm states that the osenv package is no longer supported."
---

# osenv is no longer supported

npm states that the osenv package is no longer supported.

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `npm` |
| Component | `pkg:npm/osenv` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.osenv.eol` |

## Sources

- [osenv package deprecation notice](https://www.npmjs.com/package/osenv)
- [osenv registry metadata](https://registry.npmjs.org/osenv/latest)

## Migration

**Constraints**

- Preserve platform-specific home, temp, editor, shell, path, and environment-variable fallback behavior actually used by the application.

**Steps**

1. **Replace operating-system environment helpers.** Replace each osenv helper with maintained runtime APIs and explicit environment-variable handling, then remove osenv.

**Verification**

- `npm run test --if-present`: Run environment resolution and cross-platform repository tests.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.osenv.eol`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
