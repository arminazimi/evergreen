---
title: "pkgutil.find_loader and get_loader are deprecated — dates, impact, migration"
description: "Python 3.12 deprecates pkgutil.find_loader() and pkgutil.get_loader(), to be removed in Python 3.14."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.symbol.pkgutil.find-loader.html"
---

# pkgutil.find_loader and get_loader are deprecated

Python 3.12 deprecates pkgutil.find_loader() and pkgutil.get_loader(), to be removed in Python 3.14.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `python` |
| Component | `pkg:generic/python` |
| Affected versions | `vers:pypi/>=3.12` |
| Date from the source | The source gives no day |
| Replacement | importlib.util.find_spec() |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-10-21 (365 days after the last review) |
| Rule ID | `python.symbol.pkgutil.find-loader` |

## Sources

- [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html)
- [Python deprecations: pending removal in 3.14](https://docs.python.org/3/deprecations/pending-removal-in-3.14.html)

## Migration

**Constraints**

- Keep the behavior of the call unchanged; check the replacement's argument and return-type differences.

**Steps**

1. **Use find_spec.** Replace the call with importlib.util.find_spec(name) and read spec.loader if the loader is needed.

**Verification**

- `python -W error::DeprecationWarning -m pytest`: Run the tests with deprecation warnings as errors when pytest is used.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.symbol.pkgutil.find-loader`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.symbol.pkgutil.find-loader.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.symbol.pkgutil.find-loader.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.symbol.pkgutil.find-loader.html",
  "headline": "pkgutil.find_loader and get_loader are deprecated — dates, impact, migration",
  "description": "Python 3.12 deprecates pkgutil.find_loader() and pkgutil.get_loader(), to be removed in Python 3.14.",
  "inLanguage": "en",
  "dateModified": "2026-10-21",
  "keywords": [
    "deprecated",
    "python",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "pkgutil.find_loader and get_loader are deprecated",
    "identifier": "pkg:generic/python"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "What's New in Python 3.12",
      "url": "https://docs.python.org/3/whatsnew/3.12.html"
    },
    {
      "@type": "CreativeWork",
      "name": "Python deprecations: pending removal in 3.14",
      "url": "https://docs.python.org/3/deprecations/pending-removal-in-3.14.html"
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
