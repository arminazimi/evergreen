---
title: "BatchNotebook is deprecated"
description: "The maintainer says not to use BatchNotebook, marks it deprecated, and recommends runipy."
---

# BatchNotebook is deprecated

The maintainer says not to use BatchNotebook, marks it deprecated, and recommends runipy.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `python` |
| Component | `pkg:pypi/batchnotebook` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | runipy |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.batchnotebook.deprecated` |

## Sources

- [BatchNotebook deprecation notice](https://pypi.org/project/BatchNotebook/)

## Migration

**Constraints**

- Preserve notebook input and output paths, cell execution order, timeouts, errors, kernel selection, and rendered report artifacts.

**Steps**

1. **Replace BatchNotebook.** Move notebook execution to runipy as recommended by the maintainer, or to the maintained notebook execution facility selected by the project, then remove BatchNotebook.

**Verification**

- `python -m pytest`: Run notebook execution, timeout, failure, output, and project tests when defined.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.batchnotebook.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
