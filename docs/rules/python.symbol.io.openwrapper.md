---
title: "Io.OpenWrapper has been removed — dates, impact, migration"
description: "Python 3.12 removed io.OpenWrapper, so using it raises an error."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.symbol.io.openwrapper.html"
json_twin: "/rules/python.symbol.io.openwrapper.json"
---

# Io.OpenWrapper has been removed

Python 3.12 removed io.OpenWrapper, so using it raises an error.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Removed |
| Severity | high |
| Ecosystem | `python` |
| Component | `pkg:generic/python` |
| Affected versions | `vers:pypi/>=3.12` |
| Date from the source | The source gives no day |
| Replacement | open() |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-10-21 (365 days after the last review) |
| Rule ID | `python.symbol.io.openwrapper` |

## Sources

- [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html)

## Migration

**Constraints**

- Keep the behavior of the code unchanged; check the replacement's argument and return-value differences.

**Steps**

1. **Replace the usage.** Replace each reported use of io.OpenWrapper with open().

**Verification**

- `python -W error::DeprecationWarning -m pytest`: Run the tests with deprecation warnings as errors when pytest is used.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.symbol.io.openwrapper`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.symbol.io.openwrapper.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.symbol.io.openwrapper.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.symbol.io.openwrapper.html",
  "headline": "Io.OpenWrapper has been removed — dates, impact, migration",
  "description": "Python 3.12 removed io.OpenWrapper, so using it raises an error.",
  "inLanguage": "en",
  "dateModified": "2026-10-21",
  "keywords": [
    "removed",
    "python",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Io.OpenWrapper has been removed",
    "identifier": "pkg:generic/python"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "What's New in Python 3.12",
      "url": "https://docs.python.org/3/whatsnew/3.12.html"
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
