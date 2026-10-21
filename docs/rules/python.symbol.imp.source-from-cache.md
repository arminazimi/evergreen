---
title: "Imp.source_from_cache has been removed — dates, impact, migration"
description: "Python 3.12 removed imp.source_from_cache, so using it raises an error."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.symbol.imp.source-from-cache.html"
---

# Imp.source_from_cache has been removed

Python 3.12 removed imp.source_from_cache, so using it raises an error.

| | |
| --- | --- |
| Status | Removed |
| Severity | high |
| Ecosystem | `python` |
| Component | `pkg:generic/python` |
| Affected versions | `vers:pypi/>=3.12` |
| Date from the source | The source gives no day |
| Replacement | importlib.util.source_from_cache() |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-10-21 (365 days after the last review) |
| Rule ID | `python.symbol.imp.source-from-cache` |

## Sources

- [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html)

## Migration

**Constraints**

- Keep the behavior of the code unchanged; check the replacement's argument and return-value differences.

**Steps**

1. **Replace the usage.** Replace each reported use of imp.source_from_cache with importlib.util.source_from_cache().

**Verification**

- `python -W error::DeprecationWarning -m pytest`: Run the tests with deprecation warnings as errors when pytest is used.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.symbol.imp.source-from-cache`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.symbol.imp.source-from-cache.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.symbol.imp.source-from-cache.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.symbol.imp.source-from-cache.html",
  "headline": "Imp.source_from_cache has been removed — dates, impact, migration",
  "description": "Python 3.12 removed imp.source_from_cache, so using it raises an error.",
  "inLanguage": "en",
  "dateModified": "2026-10-21",
  "keywords": [
    "removed",
    "python",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Imp.source_from_cache has been removed",
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
