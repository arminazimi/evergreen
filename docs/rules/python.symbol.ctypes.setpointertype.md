---
title: "Ctypes.SetPointerType is deprecated — dates, impact, migration"
description: "Python 3.13 deprecates ctypes.SetPointerType, to be removed in Python 3.15."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.symbol.ctypes.setpointertype.html"
---

# Ctypes.SetPointerType is deprecated

**Deprecated.** The source gives no day. Source: [What's New in Python 3.13](https://docs.python.org/3/whatsnew/3.13.html).

Check a version:

```bash
evergreen check pkg:generic/python
```

Python 3.13 deprecates ctypes.SetPointerType, to be removed in Python 3.15.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | low |
| Ecosystem | `python` |
| Component | `pkg:generic/python` |
| Affected versions | `vers:pypi/>=3.13` |
| Date from the source | The source gives no day |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-10-21 (365 days after the last review) |
| Rule ID | `python.symbol.ctypes.setpointertype` |

## Sources

- [What's New in Python 3.13](https://docs.python.org/3/whatsnew/3.13.html)
- [Python deprecations: pending removal in 3.15](https://docs.python.org/3/deprecations/pending-removal-in-3.15.html)

## Migration

**Constraints**

- Keep the behavior of the code unchanged; check the replacement's argument and return-value differences.

**Steps**

1. **Replace the usage.** Replace each reported use of ctypes.SetPointerType with code that no longer depends on it.

**Verification**

- `python -W error::DeprecationWarning -m pytest`: Run the tests with deprecation warnings as errors when pytest is used.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.symbol.ctypes.setpointertype`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.symbol.ctypes.setpointertype.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.symbol.ctypes.setpointertype.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.symbol.ctypes.setpointertype.html",
  "headline": "Ctypes.SetPointerType is deprecated — dates, impact, migration",
  "description": "Python 3.13 deprecates ctypes.SetPointerType, to be removed in Python 3.15.",
  "inLanguage": "en",
  "dateModified": "2026-10-21",
  "keywords": [
    "deprecated",
    "python",
    "low"
  ],
  "about": {
    "@type": "Thing",
    "name": "Ctypes.SetPointerType is deprecated",
    "identifier": "pkg:generic/python"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "What's New in Python 3.13",
      "url": "https://docs.python.org/3/whatsnew/3.13.html"
    },
    {
      "@type": "CreativeWork",
      "name": "Python deprecations: pending removal in 3.15",
      "url": "https://docs.python.org/3/deprecations/pending-removal-in-3.15.html"
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
