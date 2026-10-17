---
title: "distribute is deprecated"
description: "The project describes Distribute as a deprecated Setuptools fork whose code was merged back into Setuptools."
---

# distribute is deprecated

The project describes Distribute as a deprecated Setuptools fork whose code was merged back into Setuptools.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | high |
| Ecosystem | `python` |
| Component | `pkg:pypi/distribute` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | setuptools |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.distribute.deprecated` |

## Sources

- [Distribute deprecation notice](https://pypi.org/project/distribute/)

## Migration

**Constraints**

- Preserve build backend behavior, package metadata, entry points, and supported installer environments.

**Steps**

1. **Replace Distribute.** Replace distribute requirements and bootstrap scripts with setuptools and remove distribute-specific installation logic.
2. **Verify package builds.** Build source and wheel distributions in a clean environment and inspect their metadata and entry points.

**Verification**

- `python -m pip check`: Check the packaging environment after replacement.
- `python -m pytest`: Run packaging and repository tests.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.distribute.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
