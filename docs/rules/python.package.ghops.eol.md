---
title: "ghops is deprecated and no longer maintained"
description: "The maintainer states that ghops is deprecated and no longer maintained, and directs users to repoindex."
---

# ghops is deprecated and no longer maintained

The maintainer states that ghops is deprecated and no longer maintained, and directs users to repoindex.

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `python` |
| Component | `pkg:pypi/ghops` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | repoindex |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.ghops.eol` |

## Sources

- [ghops deprecation notice](https://pypi.org/project/ghops/)

## Migration

**Constraints**

- Preserve repository discovery, grouping, metadata, configuration, command output, and any persisted collection state.

**Steps**

1. **Move to repoindex.** Replace ghops with repoindex, translate configuration and commands, and migrate any persisted repository collection data.

**Verification**

- `python -m pytest`: Run repository discovery, metadata, command, and project tests when defined.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.ghops.eol`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
