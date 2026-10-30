---
title: "Python 3.9 and older are end-of-life — dates, impact, migration"
description: "These Python release lines no longer receive security or bug fixes from the Python core team."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.runtime.eol-3.9-and-older.html"
json_twin: "/rules/python.runtime.eol-3.9-and-older.json"
---

# Python 3.9 and older are end-of-life

These Python release lines no longer receive security or bug fixes from the Python core team.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `python` |
| Component | `pkg:generic/python` |
| Affected versions | `vers:pypi/<3.10` |
| Date from the source | 2025-10-31 |
| Replacement | A supported Python release |
| Evidence last seen | 2026-10-14 |
| Reviewed | 2026-10-14 by arminazimi |
| Review due | 2027-10-14 (365 days after the last review) |
| Rule ID | `python.runtime.eol-3.9-and-older` |

## Sources

- [Status of Python versions](https://devguide.python.org/versions/)
- [PEP 596 — Python 3.9 release schedule](https://peps.python.org/pep-0596/)

## Migration

**Constraints**

- Keep project metadata, local version files, CI matrices, containers, and deployment runtimes on a mutually supported Python version.
- Confirm binary wheels and framework dependencies support the selected Python release.

**Steps**

1. **Update the Python requirement.** Raise the reported requires-python range or pinned runtime to a supported Python release.
2. **Align runtime surfaces.** Update matching version files, CI matrices, container images, and deployment configuration.

**Verification**

- `python --version`: Confirm the active Python runtime is supported.
- `python -m pytest`: Run the Python test suite on the target runtime.
- `python -m pip check`: Check installed dependency compatibility.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.runtime.eol-3.9-and-older`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.runtime.eol-3.9-and-older.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.runtime.eol-3.9-and-older.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.runtime.eol-3.9-and-older.html",
  "headline": "Python 3.9 and older are end-of-life — dates, impact, migration",
  "description": "These Python release lines no longer receive security or bug fixes from the Python core team.",
  "inLanguage": "en",
  "dateModified": "2026-10-14",
  "keywords": [
    "end-of-life",
    "python",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Python 3.9 and older are end-of-life",
    "identifier": "pkg:generic/python"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Status of Python versions",
      "url": "https://devguide.python.org/versions/"
    },
    {
      "@type": "CreativeWork",
      "name": "PEP 596 — Python 3.9 release schedule",
      "url": "https://peps.python.org/pep-0596/"
    }
  ],
  "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/python.json",
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen"
  }
}
</script>
