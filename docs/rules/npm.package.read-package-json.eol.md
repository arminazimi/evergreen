---
title: "read-package-json is no longer supported"
description: "npm states that read-package-json is no longer supported and recommends @npmcli/package-json."
---

# read-package-json is no longer supported

npm states that read-package-json is no longer supported and recommends @npmcli/package-json.

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `npm` |
| Component | `pkg:npm/read-package-json` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | @npmcli/package-json |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.read-package-json.eol` |

## Sources

- [read-package-json package deprecation notice](https://www.npmjs.com/package/read-package-json)
- [read-package-json registry metadata](https://registry.npmjs.org/read-package-json/latest)

## Migration

**Constraints**

- Preserve package normalization, extra metadata loading, error handling, file paths, warnings, and callback or promise timing relied on by callers.

**Steps**

1. **Move to @npmcli/package-json.** Replace the dependency and reads with @npmcli/package-json, adapting its promise-based API and normalized result shape.

**Verification**

- `npm run test --if-present`: Run valid, malformed, missing, and normalized package metadata tests.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.read-package-json.eol`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
