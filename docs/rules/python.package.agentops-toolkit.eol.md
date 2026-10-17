---
title: "agentops-toolkit was renamed and is no longer maintained"
description: "The maintainer states that agentops-toolkit is no longer maintained and now ships as agentops-accelerator."
---

# agentops-toolkit was renamed and is no longer maintained

The maintainer states that agentops-toolkit is no longer maintained and now ships as agentops-accelerator.

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `python` |
| Component | `pkg:pypi/agentops-toolkit` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | agentops-accelerator |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.agentops-toolkit.eol` |

## Sources

- [agentops-toolkit rename notice](https://pypi.org/project/agentops-toolkit/)

## Migration

**Constraints**

- Preserve the agentops import path, CLI entrypoints, public APIs, configuration, telemetry, and stored project state.

**Steps**

1. **Move to agentops-accelerator.** Replace the distribution with agentops-accelerator while retaining existing agentops imports and verifying CLI and public API compatibility.

**Verification**

- `python -m pytest`: Run AgentOps API, CLI, telemetry, and project tests when defined.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.agentops-toolkit.eol`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
