---
title: "Unsupported actions/configure-pages runtime"
description: "This release predates the action's Node.js 24 runtime. GitHub no longer provides Node.js 20 on Actions runners."
---

# Unsupported actions/configure-pages runtime

This release predates the action's Node.js 24 runtime. GitHub no longer provides Node.js 20 on Actions runners.

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `github-actions` |
| Component | `pkg:github/actions/configure-pages` |
| Affected versions | `vers:semver/<6.0.0` |
| Date from the source | 2026-09-23 |
| Replacement | actions/configure-pages@v6 or later |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by claude-agent |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `github-actions.configure-pages.node20` |

## Sources

- [Node 20 is no longer available in GitHub Actions](https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/)
- [actions/configure-pages v6.0.0 release notes](https://github.com/actions/configure-pages/releases/tag/v6.0.0)

## Migration

**Constraints**

- Preserve the Pages site configuration and static-site generator inputs when upgrading.

**Steps**

1. **Upgrade configure-pages.** Change the uses reference to actions/configure-pages@v6 or a later supported major.
2. **Review configure-pages inputs.** Compare configured inputs with the target release and update renamed or changed options; confirm the runner meets the release's minimum version.

**Verification**

- `git diff --check`: Validate the edited workflow diff.

## Detected by

The `github-actions` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/github-actions.json`](https://github.com/arminazimi/evergreen/blob/main/registry/github-actions.json), rule `github-actions.configure-pages.node20`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
