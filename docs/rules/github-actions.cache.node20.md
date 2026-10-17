---
title: "Unsupported actions/cache runtime"
description: "This release uses a retired JavaScript runtime or cache service. Version 5 moved the action to Node.js 24."
---

# Unsupported actions/cache runtime

This release uses a retired JavaScript runtime or cache service. Version 5 moved the action to Node.js 24.

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `github-actions` |
| Component | `pkg:github/actions/cache` |
| Affected versions | `vers:semver/<5.0.0` |
| Date from the source | 2026-09-23 |
| Replacement | actions/cache@v5 or later |
| Evidence last seen | 2026-10-13 |
| Reviewed | 2026-10-14 by arminazimi |
| Review due | 2027-10-14 (365 days after the last review) |
| Rule ID | `github-actions.cache.node20` |

## Sources

- [Node 20 is no longer available in GitHub Actions](https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/)
- [actions/cache runtime and service guidance](https://github.com/actions/cache#whats-new)

## Migration

**Constraints**

- Preserve cache keys, restore-key ordering, paths, and cache-hit dependent control flow.

**Steps**

1. **Upgrade the cache action.** Change the uses reference to actions/cache@v5 or a later supported major.
2. **Review cache behavior.** Verify cache paths, keys, restore keys, and cache-hit output consumers against the target release.

**Verification**

- `git diff --check`: Validate the edited workflow diff.

## Detected by

The `github-actions` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/github-actions.json`](https://github.com/arminazimi/evergreen/blob/main/registry/github-actions.json), rule `github-actions.cache.node20`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
