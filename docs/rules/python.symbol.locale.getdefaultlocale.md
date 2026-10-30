---
title: "locale.getdefaultlocale is deprecated — dates, impact, migration"
description: "Python 3.11 deprecates locale.getdefaultlocale(), to be removed in Python 3.15."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.symbol.locale.getdefaultlocale.html"
---

# locale.getdefaultlocale is deprecated

**Deprecated.** The source gives no day. Replacement: locale.setlocale(), locale.getpreferredencoding(False), or locale.getlocale(). Source: [What's New in Python 3.11](https://docs.python.org/3/whatsnew/3.11.html).

Check a version:

```bash
evergreen check pkg:generic/python
```

Python 3.11 deprecates locale.getdefaultlocale(), to be removed in Python 3.15.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | low |
| Ecosystem | `python` |
| Component | `pkg:generic/python` |
| Affected versions | `vers:pypi/>=3.11` |
| Date from the source | The source gives no day |
| Replacement | locale.setlocale(), locale.getpreferredencoding(False), or locale.getlocale() |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-10-21 (365 days after the last review) |
| Rule ID | `python.symbol.locale.getdefaultlocale` |

## Sources

- [What's New in Python 3.11](https://docs.python.org/3/whatsnew/3.11.html)

## Migration

**Constraints**

- Keep the behavior of the call unchanged; check the replacement's argument and return-type differences.

**Steps**

1. **Use the locale API.** Use locale.getlocale() for the current locale and locale.getpreferredencoding(False) for the encoding.

**Verification**

- `python -W error::DeprecationWarning -m pytest`: Run the tests with deprecation warnings as errors when pytest is used.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.symbol.locale.getdefaultlocale`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.symbol.locale.getdefaultlocale.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.symbol.locale.getdefaultlocale.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.symbol.locale.getdefaultlocale.html",
  "headline": "locale.getdefaultlocale is deprecated — dates, impact, migration",
  "description": "Python 3.11 deprecates locale.getdefaultlocale(), to be removed in Python 3.15.",
  "inLanguage": "en",
  "dateModified": "2026-10-21",
  "keywords": [
    "deprecated",
    "python",
    "low"
  ],
  "about": {
    "@type": "Thing",
    "name": "locale.getdefaultlocale is deprecated",
    "identifier": "pkg:generic/python"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "What's New in Python 3.11",
      "url": "https://docs.python.org/3/whatsnew/3.11.html"
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
