---
title: "datetime.utcfromtimestamp is deprecated — dates, impact, migration"
description: "Python 3.12 deprecates datetime.datetime.utcfromtimestamp() and says to use timezone-aware objects to represent datetimes in UTC."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.symbol.datetime.utcfromtimestamp.html"
---

# datetime.utcfromtimestamp is deprecated

**Deprecated.** The source gives no day. Replacement: datetime.fromtimestamp(timestamp, datetime.UTC). Source: [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html).

Check a version:

```bash
evergreen check pkg:generic/python
```

Python 3.12 deprecates datetime.datetime.utcfromtimestamp() and says to use timezone-aware objects to represent datetimes in UTC.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `python` |
| Component | `pkg:generic/python` |
| Affected versions | `vers:pypi/>=3.12` |
| Date from the source | The source gives no day |
| Replacement | datetime.fromtimestamp(timestamp, datetime.UTC) |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-10-21 (365 days after the last review) |
| Rule ID | `python.symbol.datetime.utcfromtimestamp` |

## Sources

- [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html)
- [datetime documentation](https://docs.python.org/3/library/datetime.html)

## Migration

**Constraints**

- Keep the behavior of the call unchanged; check the replacement's argument and return-type differences.

**Steps**

1. **Use an aware datetime.** Replace datetime.utcfromtimestamp(ts) with datetime.fromtimestamp(ts, datetime.UTC); check comparisons with naive datetimes.

**Verification**

- `python -W error::DeprecationWarning -m pytest`: Run the tests with deprecation warnings as errors when pytest is used.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.symbol.datetime.utcfromtimestamp`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.symbol.datetime.utcfromtimestamp.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.symbol.datetime.utcfromtimestamp.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.symbol.datetime.utcfromtimestamp.html",
  "headline": "datetime.utcfromtimestamp is deprecated — dates, impact, migration",
  "description": "Python 3.12 deprecates datetime.datetime.utcfromtimestamp() and says to use timezone-aware objects to represent datetimes in UTC.",
  "inLanguage": "en",
  "dateModified": "2026-10-21",
  "keywords": [
    "deprecated",
    "python",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "datetime.utcfromtimestamp is deprecated",
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
      "name": "datetime documentation",
      "url": "https://docs.python.org/3/library/datetime.html"
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
