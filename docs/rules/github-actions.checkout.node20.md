---
title: "Unsupported actions/checkout runtime"
description: "This release predates the action's Node.js 24 runtime. GitHub no longer provides Node.js 20 on Actions runners."
---

# Unsupported actions/checkout runtime

This release predates the action's Node.js 24 runtime. GitHub no longer provides Node.js 20 on Actions runners.

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `github-actions` |
| Component | `pkg:github/actions/checkout` |
| Affected versions | `vers:semver/<5.0.0` |
| Date from the source | 2026-09-23 |
| Replacement | actions/checkout@v5 or later |
| Evidence last seen | 2026-10-13 |
| Reviewed | 2026-10-14 by arminazimi |
| Review due | 2027-10-14 (365 days after the last review) |
| Rule ID | `github-actions.checkout.node20` |

## Sources

- [Node 20 is no longer available in GitHub Actions](https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/)
- [actions/checkout runtime guidance](https://github.com/actions/checkout#checkout-v5)

## Migration

**Constraints**

- Preserve checkout depth, credentials, submodule, and sparse-checkout behavior configured through action inputs.

**Steps**

1. **Upgrade the checkout action.** Change the uses reference to actions/checkout@v5 or a later supported major.
2. **Review checkout inputs.** Compare configured inputs with the target release and update renamed or changed options.

**Verification**

- `git diff --check`: Validate the edited workflow diff.

## Detected by

The `github-actions` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/github-actions.json`](https://github.com/arminazimi/evergreen/blob/main/registry/github-actions.json), rule `github-actions.checkout.node20`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
