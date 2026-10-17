---
title: "@npmcli/move-file is deprecated"
description: "npm states that @npmcli/move-file functionality moved to @npmcli/fs."
---

# @npmcli/move-file is deprecated

npm states that @npmcli/move-file functionality moved to @npmcli/fs.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/%40npmcli/move-file` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | @npmcli/fs |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.npmcli-move-file.deprecated` |

## Sources

- [@npmcli/move-file package deprecation notice](https://www.npmjs.com/package/@npmcli/move-file)
- [@npmcli/move-file registry metadata](https://registry.npmjs.org/@npmcli%2Fmove-file/latest)

## Migration

**Constraints**

- Preserve overwrite, cross-device fallback, directory creation, permissions, error propagation, and platform-specific move behavior.

**Steps**

1. **Move to @npmcli/fs.** Replace the dependency and imports with the move-file functionality exposed by @npmcli/fs, adapting changed exports and options.

**Verification**

- `npm run test --if-present`: Run same-device, cross-device, overwrite, failure, and repository tests.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.npmcli-move-file.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
