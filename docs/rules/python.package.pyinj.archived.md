---
title: "pyinj is archived on PyPI"
description: "PyPI marks pyinj as archived, and the maintainers state that the repository is no longer maintained."
---

# pyinj is archived on PyPI

PyPI marks pyinj as archived, and the maintainers state that the repository is no longer maintained.

| | |
| --- | --- |
| Status | End of life |
| Severity | medium |
| Ecosystem | `python` |
| Component | `pkg:pypi/pyinj` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | injx |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.pyinj.archived` |

## Sources

- [pyinj archival and migration notice](https://pypi.org/project/pyinj/)
- [pyinj project status (PyPI Simple API)](https://pypi.org/simple/pyinj/)
- [Project status markers (PEP 792)](https://packaging.python.org/specifications/project-status-markers/)

## Migration

**Constraints**

- Preserve provider scopes, binding resolution, constructor injection, overrides, and application startup behavior.

**Steps**

1. **Replace pyinj with injx.** Replace the distribution and imports, then translate bindings and injection declarations to the injx API.
2. **Verify the injection graph.** Exercise application startup, nested dependencies, scopes, overrides, and missing-binding errors.

**Verification**

- `python -m pytest`: Run dependency-injection and repository tests.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.pyinj.archived`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
