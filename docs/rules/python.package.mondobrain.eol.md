---
title: "mondobrain is no longer maintained"
description: "The maintainer yanked mondobrain releases because the project is no longer maintained and recommends datawhys."
---

# mondobrain is no longer maintained

The maintainer yanked mondobrain releases because the project is no longer maintained and recommends datawhys.

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `python` |
| Component | `pkg:pypi/mondobrain` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | datawhys |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.mondobrain.eol` |

## Sources

- [mondobrain maintenance and replacement notice](https://pypi.org/project/mondobrain/)

## Migration

**Constraints**

- Preserve data loading, analysis workflows, notebook integration, model behavior, and serialized artifacts relied on by users.

**Steps**

1. **Move to datawhys.** Replace the distribution and translate mondobrain imports and workflows to datawhys equivalents.

**Verification**

- `python -m pytest`: Run affected data workflow and project tests when defined.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.mondobrain.eol`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
