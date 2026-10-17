---
title: "Retired actions/upload-artifact release"
description: "This release uses a retired artifact service or JavaScript runtime. Version 7 runs on Node.js 24."
---

# Retired actions/upload-artifact release

This release uses a retired artifact service or JavaScript runtime. Version 7 runs on Node.js 24.

| | |
| --- | --- |
| Status | Removed |
| Severity | critical |
| Ecosystem | `github-actions` |
| Component | `pkg:github/actions/upload-artifact` |
| Affected versions | `vers:semver/<7.0.0` |
| Date from the source | 2026-09-23 |
| Replacement | actions/upload-artifact@v7 or later |
| Evidence last seen | 2026-10-13 |
| Reviewed | 2026-10-14 by arminazimi |
| Review due | 2027-10-14 (365 days after the last review) |
| Rule ID | `github-actions.upload-artifact.retired` |

## Sources

- [Node 20 is no longer available in GitHub Actions](https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/)
- [Deprecation notice for artifact actions v3](https://github.blog/changelog/2024-04-16-deprecation-notice-v3-of-the-artifact-actions/)

## Migration

**Constraints**

- Preserve artifact names, selected paths, retention settings, and overwrite behavior.

**Steps**

1. **Upgrade upload-artifact.** Change the uses reference to actions/upload-artifact@v7 or a later supported major.
2. **Review upload inputs.** Confirm artifact paths, names, retention-days, compression, and overwrite settings against the target release.

**Verification**

- `git diff --check`: Validate the edited workflow diff.

## Detected by

The `github-actions` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/github-actions.json`](https://github.com/arminazimi/evergreen/blob/main/registry/github-actions.json), rule `github-actions.upload-artifact.retired`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
