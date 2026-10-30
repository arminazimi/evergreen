---
title: "Imp.find_module has been removed — dates, impact, migration"
description: "Python 3.12 removed imp.find_module, so using it raises an error."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.symbol.imp.find-module.html"
json_twin: "/rules/python.symbol.imp.find-module.json"
---

# Imp.find_module has been removed

**Removed.** The source gives no day. Replacement: importlib.util.find_spec(). Source: [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html).

Check a version:

```bash
evergreen check pkg:generic/python
```

Python 3.12 removed imp.find_module, so using it raises an error.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Removed |
| Severity | high |
| Ecosystem | `python` |
| Component | `pkg:generic/python` |
| Affected versions | `vers:pypi/>=3.12` |
| Date from the source | The source gives no day |
| Replacement | importlib.util.find_spec() |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-10-21 (365 days after the last review) |
| Rule ID | `python.symbol.imp.find-module` |

## Sources

- [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html)

## Migration

**Constraints**

- Keep the behavior of the code unchanged; check the replacement's argument and return-value differences.

**Steps**

1. **Replace the usage.** Replace each reported use of imp.find_module with importlib.util.find_spec().

**Verification**

- `python -W error::DeprecationWarning -m pytest`: Run the tests with deprecation warnings as errors when pytest is used.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.symbol.imp.find-module`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/python.symbol.imp.find-module.html",
      "url": "https://arminazimi.github.io/evergreen/rules/python.symbol.imp.find-module.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.symbol.imp.find-module.html",
      "headline": "Imp.find_module has been removed — dates, impact, migration",
      "description": "Python 3.12 removed imp.find_module, so using it raises an error.",
      "inLanguage": "en",
      "dateModified": "2026-10-21",
      "keywords": [
        "removed",
        "python",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "Imp.find_module has been removed",
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
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/python.symbol.imp.find-module.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/python.symbol.imp.find-module.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/python?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Removed. The source gives no day. Affected versions: vers:pypi/>=3.12. Source: What's New in Python 3.12 (https://docs.python.org/3/whatsnew/3.12.html)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/python?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "importlib.util.find_spec()"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/python?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/python."
          }
        }
      ]
    }
  ]
}
</script>
