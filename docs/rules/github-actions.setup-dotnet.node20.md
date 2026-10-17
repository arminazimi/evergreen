---
title: "Unsupported actions/setup-dotnet runtime"
description: "This release predates the action's Node.js 24 runtime. GitHub no longer provides Node.js 20 on Actions runners."
---

# Unsupported actions/setup-dotnet runtime

This release predates the action's Node.js 24 runtime. GitHub no longer provides Node.js 20 on Actions runners.

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `github-actions` |
| Component | `pkg:github/actions/setup-dotnet` |
| Affected versions | `vers:semver/<5.0.0` |
| Date from the source | 2026-09-23 |
| Replacement | actions/setup-dotnet@v5 or later |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by claude-agent |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `github-actions.setup-dotnet.node20` |

## Sources

- [Node 20 is no longer available in GitHub Actions](https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/)
- [actions/setup-dotnet v5.0.0 release notes](https://github.com/actions/setup-dotnet/releases/tag/v5.0.0)

## Migration

**Constraints**

- Preserve the SDK version, global.json handling, and package-source authentication inputs when upgrading.

**Steps**

1. **Upgrade setup-dotnet.** Change the uses reference to actions/setup-dotnet@v5 or a later supported major.
2. **Review setup-dotnet inputs.** Compare configured inputs with the target release and update renamed or changed options; confirm the runner meets the release's minimum version.

**Verification**

- `git diff --check`: Validate the edited workflow diff.

## Detected by

The `github-actions` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/github-actions.json`](https://github.com/arminazimi/evergreen/blob/main/registry/github-actions.json), rule `github-actions.setup-dotnet.node20`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
