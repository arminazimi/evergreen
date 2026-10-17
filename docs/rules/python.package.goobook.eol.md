---
title: "goobook is no longer maintained"
description: "The maintainer states that the project is no longer maintained."
---

# goobook is no longer maintained

The maintainer states that the project is no longer maintained.

| | |
| --- | --- |
| Status | End of life |
| Severity | medium |
| Ecosystem | `python` |
| Component | `pkg:pypi/goobook` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.goobook.eol` |

## Sources

- [goobook maintenance notice](https://pypi.org/project/goobook/)

## Migration

**Constraints**

- Preserve contact fields, address-book search, authentication, caching, and command output used by scripts.

**Steps**

1. **Select a maintained contacts client.** Choose a maintained Google Contacts or CardDAV client, export or preserve local state, and replace goobook commands and integrations.

**Verification**

- `python -m pytest`: Run contact lookup, synchronization, and repository tests when defined.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.goobook.eol`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
