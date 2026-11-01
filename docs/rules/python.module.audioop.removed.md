---
title: "The audioop module was removed in Python 3.13 — dates, impact, migration"
description: "Python 3.13 removed the audioop module (PEP 594), so importing it raises ModuleNotFoundError."
layout: doc
permalink: "/rules/python.module.audioop.removed.html"
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.module.audioop.removed.html"
image: "/assets/og/python.module.audioop.removed.svg"
review_date: "2026-10-30"
last_modified_at: "2026-10-30"
json_twin: "/rules/python.module.audioop.removed.json"
---

# The audioop module was removed in Python 3.13

**Removed.** The source gives no day. Replacement: the audioop-lts package. Source: [PEP 594 — Removing dead batteries from the standard library](https://peps.python.org/pep-0594/).

Check a version:

```bash
evergreen check pkg:generic/python
```

Python 3.13 removed the audioop module (PEP 594), so importing it raises ModuleNotFoundError.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Removed |
| Severity | high |
| Ecosystem | `python` |
| Component | `pkg:generic/python` |
| Affected versions | `vers:pypi/>=3.13` |
| Date from the source | The source gives no day |
| Replacement | the audioop-lts package |
| Evidence last seen | 2026-10-30 |
| Reviewed | 2026-10-30 by arminazimi |
| Review due | 2027-10-30 (365 days after the last review) |
| Rule ID | `python.module.audioop.removed` |

## Sources

- [PEP 594 — Removing dead batteries from the standard library](https://peps.python.org/pep-0594/)
- [What's New in Python 3.13](https://docs.python.org/3/whatsnew/3.13.html)

## Migration

**Constraints**

- Keep the behavior of the code unchanged; check the replacement's argument and return-value differences.

**Steps**

1. **Replace the audioop import.** Replace each reported import of audioop with the audioop-lts package.

**Verification**

- `python -W error::DeprecationWarning -m pytest`: Run the tests with deprecation warnings treated as errors when pytest is used.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Other versions of this product

- [The aifc module was removed in Python 3.13](python.module.aifc.removed.html)
- [The asynchat module was removed in Python 3.12](python.module.asynchat.removed.html)
- [The asyncore module was removed in Python 3.12](python.module.asyncore.removed.html)
- [The cgi module was removed in Python 3.13](python.module.cgi.removed.html)
- [The cgitb module was removed in Python 3.13](python.module.cgitb.removed.html)
- [The chunk module was removed in Python 3.13](python.module.chunk.removed.html)
- [The crypt module was removed in Python 3.13](python.module.crypt.removed.html)
- [The distutils module was removed in Python 3.12](python.module.distutils.removed.html)
- [The imghdr module was removed in Python 3.13](python.module.imghdr.removed.html)
- [The imp module was removed in Python 3.12](python.module.imp.removed.html)
- [The lib2to3 module was removed in Python 3.13](python.module.lib2to3.removed.html)
- [The mailcap module was removed in Python 3.13](python.module.mailcap.removed.html)

### Same ecosystem

- [The msilib module was removed in Python 3.13](python.module.msilib.removed.html)
- [The nis module was removed in Python 3.13](python.module.nis.removed.html)
- [The nntplib module was removed in Python 3.13](python.module.nntplib.removed.html)
- [The ossaudiodev module was removed in Python 3.13](python.module.ossaudiodev.removed.html)
- [The pipes module was removed in Python 3.13](python.module.pipes.removed.html)
- [The smtpd module was removed in Python 3.12](python.module.smtpd.removed.html)
- [The sndhdr module was removed in Python 3.13](python.module.sndhdr.removed.html)
- [The spwd module was removed in Python 3.13](python.module.spwd.removed.html)


## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.module.audioop.removed`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/python.module.audioop.removed.html",
      "url": "https://arminazimi.github.io/evergreen/rules/python.module.audioop.removed.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.module.audioop.removed.html",
      "headline": "The audioop module was removed in Python 3.13 — dates, impact, migration",
      "description": "Python 3.13 removed the audioop module (PEP 594), so importing it raises ModuleNotFoundError.",
      "inLanguage": "en",
      "dateModified": "2026-10-30",
      "keywords": [
        "removed",
        "python",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "The audioop module was removed in Python 3.13",
        "identifier": "pkg:generic/python"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "PEP 594 — Removing dead batteries from the standard library",
          "url": "https://peps.python.org/pep-0594/"
        },
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
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/python.module.audioop.removed.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/python.module.audioop.removed.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/python?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Removed. The source gives no day. Affected versions: vers:pypi/>=3.13. Source: PEP 594 — Removing dead batteries from the standard library (https://peps.python.org/pep-0594/)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/python?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "the audioop-lts package"
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
