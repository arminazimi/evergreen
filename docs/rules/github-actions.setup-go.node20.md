---
title: "Unsupported actions/setup-go runtime"
description: "This release predates the action's Node.js 24 runtime. GitHub no longer provides Node.js 20 on Actions runners. Version 6.0.0 and 6.1.0 still declare node20; version 6.2.0 and later declare node24."
---

# Unsupported actions/setup-go runtime

This release predates the action's Node.js 24 runtime. GitHub no longer provides Node.js 20 on Actions runners. Version 6.0.0 and 6.1.0 still declare node20; version 6.2.0 and later declare node24.

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `github-actions` |
| Component | `pkg:github/actions/setup-go` |
| Affected versions | `vers:semver/<6.0.0` |
| Date from the source | 2026-09-23 |
| Replacement | actions/setup-go@v6 or later |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by claude-agent |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `github-actions.setup-go.node20` |

## Sources

- [Node 20 is no longer available in GitHub Actions](https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/)
- [actions/setup-go v6.2.0 release notes (action.yml moves to node24)](https://github.com/actions/setup-go/releases/tag/v6.2.0)

## Migration

**Constraints**

- Preserve the requested Go version, module cache, and architecture inputs when upgrading.

**Steps**

1. **Upgrade setup-go.** Change the uses reference to actions/setup-go@v6 or a later supported major.
2. **Review setup-go inputs.** Compare configured inputs with the target release and update renamed or changed options; confirm the runner meets the release's minimum version.

**Verification**

- `git diff --check`: Validate the edited workflow diff.

## Detected by

The `github-actions` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/github-actions.json`](https://github.com/arminazimi/evergreen/blob/main/registry/github-actions.json), rule `github-actions.setup-go.node20`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
