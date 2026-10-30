---
title: "argparse is archived on PyPI — dates, impact, migration"
description: "PyPI marks argparse as archived: the project does not expect to be updated in the future."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.package.argparse.archived.html"
json_twin: "/rules/python.package.argparse.archived.json"
---

# argparse is archived on PyPI

PyPI marks argparse as archived: the project does not expect to be updated in the future.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | medium |
| Ecosystem | `python` |
| Component | `pkg:pypi/argparse` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Evidence last seen | 2026-10-20 |
| Reviewed | 2026-10-20 by arminazimi |
| Review due | 2027-10-20 (365 days after the last review) |
| Rule ID | `python.package.argparse.archived` |

## Sources

- [argparse on PyPI](https://pypi.org/project/argparse/)
- [argparse project status (PyPI Simple API)](https://pypi.org/simple/argparse/)
- [Project status markers (PEP 792)](https://packaging.python.org/specifications/project-status-markers/)

## Migration

**Constraints**

- Preserve behavior while removing argparse; PyPI says the project does not expect to be updated, so it will not receive fixes or support for newer Python releases.

**Steps**

1. **Replace argparse.** Remove argparse from requirements, pyproject.toml, and lock files and replace it with a maintained alternative (often the standard library or the project that superseded it), then update the imports.

**Verification**

- `python -m pip check`: Confirm the installed distributions have no broken requirements.
- `python -m pytest`: Run the test suite without the archived distribution.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.argparse.archived`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.package.argparse.archived.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.package.argparse.archived.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.argparse.archived.html",
  "headline": "argparse is archived on PyPI — dates, impact, migration",
  "description": "PyPI marks argparse as archived: the project does not expect to be updated in the future.",
  "inLanguage": "en",
  "dateModified": "2026-10-20",
  "keywords": [
    "end-of-life",
    "python",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "argparse is archived on PyPI",
    "identifier": "pkg:pypi/argparse"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "argparse on PyPI",
      "url": "https://pypi.org/project/argparse/"
    },
    {
      "@type": "CreativeWork",
      "name": "argparse project status (PyPI Simple API)",
      "url": "https://pypi.org/simple/argparse/"
    },
    {
      "@type": "CreativeWork",
      "name": "Project status markers (PEP 792)",
      "url": "https://packaging.python.org/specifications/project-status-markers/"
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
