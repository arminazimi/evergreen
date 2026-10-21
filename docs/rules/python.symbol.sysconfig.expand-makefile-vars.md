---
title: "Sysconfig.expand_makefile_vars is deprecated — dates, impact, migration"
description: "Python 3.14 deprecates sysconfig.expand_makefile_vars, to be removed in Python 3.16."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.symbol.sysconfig.expand-makefile-vars.html"
---

# Sysconfig.expand_makefile_vars is deprecated

Python 3.14 deprecates sysconfig.expand_makefile_vars, to be removed in Python 3.16.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | low |
| Ecosystem | `python` |
| Component | `pkg:generic/python` |
| Affected versions | `vers:pypi/>=3.14` |
| Date from the source | The source gives no day |
| Replacement | the vars argument of sysconfig.get_paths() |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-10-21 (365 days after the last review) |
| Rule ID | `python.symbol.sysconfig.expand-makefile-vars` |

## Sources

- [Python deprecations: pending removal in 3.16](https://docs.python.org/3/deprecations/pending-removal-in-3.16.html)

## Migration

**Constraints**

- Keep the behavior of the code unchanged; check the replacement's argument and return-value differences.

**Steps**

1. **Replace the usage.** Replace each reported use of sysconfig.expand_makefile_vars with the vars argument of sysconfig.get_paths().

**Verification**

- `python -W error::DeprecationWarning -m pytest`: Run the tests with deprecation warnings as errors when pytest is used.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.symbol.sysconfig.expand-makefile-vars`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.symbol.sysconfig.expand-makefile-vars.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.symbol.sysconfig.expand-makefile-vars.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.symbol.sysconfig.expand-makefile-vars.html",
  "headline": "Sysconfig.expand_makefile_vars is deprecated — dates, impact, migration",
  "description": "Python 3.14 deprecates sysconfig.expand_makefile_vars, to be removed in Python 3.16.",
  "inLanguage": "en",
  "dateModified": "2026-10-21",
  "keywords": [
    "deprecated",
    "python",
    "low"
  ],
  "about": {
    "@type": "Thing",
    "name": "Sysconfig.expand_makefile_vars is deprecated",
    "identifier": "pkg:generic/python"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Python deprecations: pending removal in 3.16",
      "url": "https://docs.python.org/3/deprecations/pending-removal-in-3.16.html"
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
