---
title: "llama-index-experimental is no longer maintained"
description: "The maintainer states that llama-index-experimental is deprecated, no longer maintained, and will receive no further updates or bug fixes."
---

# llama-index-experimental is no longer maintained

The maintainer states that llama-index-experimental is deprecated, no longer maintained, and will receive no further updates or bug fixes.

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `python` |
| Component | `pkg:pypi/llama-index-experimental` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.llama-index-experimental.eol` |

## Sources

- [llama-index-experimental lifecycle notice](https://pypi.org/project/llama-index-experimental/)

## Migration

**Constraints**

- Preserve data connectors, indexes, query behavior, prompts, model configuration, serialization, and observability used by the application.

**Steps**

1. **Replace experimental integrations.** Inventory the experimental APIs in use, select maintained LlamaIndex or alternative implementations for each, migrate call sites, then remove the package.

**Verification**

- `python -m pytest`: Run indexing, retrieval, generation, persistence, and project tests when defined.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.llama-index-experimental.eol`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
