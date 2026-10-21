---
title: "Glob.glob0 and glob.glob1 are deprecated — dates, impact, migration"
description: "Python 3.13 deprecates glob.glob0 and glob.glob1."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.symbol.glob.glob0.html"
---

# Glob.glob0 and glob.glob1 are deprecated

Python 3.13 deprecates glob.glob0 and glob.glob1.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | low |
| Ecosystem | `python` |
| Component | `pkg:generic/python` |
| Affected versions | `vers:pypi/>=3.13` |
| Date from the source | The source gives no day |
| Replacement | glob.glob() with a path-like root_dir |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-10-21 (365 days after the last review) |
| Rule ID | `python.symbol.glob.glob0` |

## Sources

- [What's New in Python 3.13](https://docs.python.org/3/whatsnew/3.13.html)

## Migration

**Constraints**

- Keep the behavior of the code unchanged; check the replacement's argument and return-value differences.

**Steps**

1. **Replace the usage.** Replace each reported use of glob.glob0 and glob.glob1 with glob.glob() with a path-like root_dir.

**Verification**

- `python -W error::DeprecationWarning -m pytest`: Run the tests with deprecation warnings as errors when pytest is used.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.symbol.glob.glob0`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.symbol.glob.glob0.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.symbol.glob.glob0.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.symbol.glob.glob0.html",
  "headline": "Glob.glob0 and glob.glob1 are deprecated — dates, impact, migration",
  "description": "Python 3.13 deprecates glob.glob0 and glob.glob1.",
  "inLanguage": "en",
  "dateModified": "2026-10-21",
  "keywords": [
    "deprecated",
    "python",
    "low"
  ],
  "about": {
    "@type": "Thing",
    "name": "Glob.glob0 and glob.glob1 are deprecated",
    "identifier": "pkg:generic/python"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "What's New in Python 3.13",
      "url": "https://docs.python.org/3/whatsnew/3.13.html"
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
