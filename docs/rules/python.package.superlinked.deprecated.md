---
title: "superlinked is deprecated for new projects"
description: "Superlinked marks its legacy Python framework deprecated for new projects and directs new development to SIE and sie-sdk."
---

# superlinked is deprecated for new projects

Superlinked marks its legacy Python framework deprecated for new projects and directs new development to SIE and sie-sdk.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `python` |
| Component | `pkg:pypi/superlinked` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | SIE and sie-sdk |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.superlinked.deprecated` |

## Sources

- [superlinked legacy framework notice](https://pypi.org/project/superlinked/)

## Migration

**Constraints**

- SIE is not a drop-in replacement; preserve schemas, indexing, storage, vector search, query weighting, model behavior, and deployment requirements explicitly.

**Steps**

1. **Redesign on SIE where appropriate.** Map legacy framework responsibilities to SIE Server and sie-sdk, redesign incompatible application layers, migrate data and queries, then remove superlinked only after parity is proven.

**Verification**

- `python -m pytest`: Run indexing, retrieval, ranking, storage, deployment, and project tests when defined.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.superlinked.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
