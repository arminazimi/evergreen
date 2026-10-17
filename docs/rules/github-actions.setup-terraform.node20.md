---
title: "Unsupported hashicorp/setup-terraform runtime"
description: "This release predates the action's Node.js 24 runtime. GitHub no longer provides Node.js 20 on Actions runners."
---

# Unsupported hashicorp/setup-terraform runtime

This release predates the action's Node.js 24 runtime. GitHub no longer provides Node.js 20 on Actions runners.

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `github-actions` |
| Component | `pkg:github/hashicorp/setup-terraform` |
| Affected versions | `vers:semver/<4.0.0` |
| Date from the source | 2026-09-23 |
| Replacement | hashicorp/setup-terraform@v4 or later |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by claude-agent |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `github-actions.setup-terraform.node20` |

## Sources

- [Node 20 is no longer available in GitHub Actions](https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/)
- [hashicorp/setup-terraform v4.0.0 release notes](https://github.com/hashicorp/setup-terraform/releases/tag/v4.0.0)

## Migration

**Constraints**

- Preserve the Terraform version, CLI configuration credentials, and wrapper setting when upgrading.

**Steps**

1. **Upgrade setup-terraform.** Change the uses reference to hashicorp/setup-terraform@v4 or a later supported major.
2. **Review setup-terraform inputs.** Compare configured inputs with the target release and update renamed or changed options; confirm the runner meets the release's minimum version.

**Verification**

- `git diff --check`: Validate the edited workflow diff.

## Detected by

The `github-actions` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/github-actions.json`](https://github.com/arminazimi/evergreen/blob/main/registry/github-actions.json), rule `github-actions.setup-terraform.node20`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
