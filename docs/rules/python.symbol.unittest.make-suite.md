---
title: "unittest.makeSuite, findTestCases and getTestCaseNames have been removed — dates, impact, migration"
description: "Python 3.13 removed the unittest functions makeSuite(), findTestCases() and getTestCaseNames(), deprecated since Python 3.11, so calls raise AttributeError."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.symbol.unittest.make-suite.html"
json_twin: "/rules/python.symbol.unittest.make-suite.json"
---

# unittest.makeSuite, findTestCases and getTestCaseNames have been removed

**Removed.** The source gives no day. Replacement: The matching TestLoader methods: loadTestsFromTestCase(), loadTestsFromModule(), getTestCaseNames(). Source: [What's New in Python 3.13](https://docs.python.org/3/whatsnew/3.13.html).

Check a version:

```bash
evergreen check pkg:generic/python
```

Python 3.13 removed the unittest functions makeSuite(), findTestCases() and getTestCaseNames(), deprecated since Python 3.11, so calls raise AttributeError.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Removed |
| Severity | high |
| Ecosystem | `python` |
| Component | `pkg:generic/python` |
| Affected versions | `vers:pypi/>=3.13` |
| Date from the source | The source gives no day |
| Replacement | The matching TestLoader methods: loadTestsFromTestCase(), loadTestsFromModule(), getTestCaseNames() |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-10-21 (365 days after the last review) |
| Rule ID | `python.symbol.unittest.make-suite` |

## Sources

- [What's New in Python 3.13](https://docs.python.org/3/whatsnew/3.13.html)
- [What's New in Python 3.11](https://docs.python.org/3/whatsnew/3.11.html)

## Migration

**Constraints**

- Keep the behavior of the call unchanged; check the replacement's argument and return-type differences.

**Steps**

1. **Use TestLoader.** Call unittest.defaultTestLoader.loadTestsFromTestCase(cls), loadTestsFromModule(module) or getTestCaseNames(cls).

**Verification**

- `python -W error::DeprecationWarning -m pytest`: Run the tests with deprecation warnings as errors when pytest is used.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.symbol.unittest.make-suite`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.symbol.unittest.make-suite.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.symbol.unittest.make-suite.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.symbol.unittest.make-suite.html",
  "headline": "unittest.makeSuite, findTestCases and getTestCaseNames have been removed — dates, impact, migration",
  "description": "Python 3.13 removed the unittest functions makeSuite(), findTestCases() and getTestCaseNames(), deprecated since Python 3.11, so calls raise AttributeError.",
  "inLanguage": "en",
  "dateModified": "2026-10-21",
  "keywords": [
    "removed",
    "python",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "unittest.makeSuite, findTestCases and getTestCaseNames have been removed",
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
