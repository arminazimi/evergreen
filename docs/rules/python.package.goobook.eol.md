---
title: "goobook is no longer maintained — dates, impact, migration"
description: "The maintainer states that the project is no longer maintained."
layout: doc
permalink: "/rules/python.package.goobook.eol.html"
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.package.goobook.eol.html"
image: "/assets/og/python.package.goobook.eol.svg"
review_date: "2026-10-16"
last_modified_at: "2026-10-16"
json_twin: "/rules/python.package.goobook.eol.json"
---

# goobook is no longer maintained

**End of life.** The source gives no day. Source: [goobook maintenance notice](https://pypi.org/project/goobook/).

Check a version:

```bash
evergreen check pkg:pypi/goobook
```

The maintainer states that the project is no longer maintained.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | medium |
| Ecosystem | `python` |
| Component | `pkg:pypi/goobook` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.goobook.eol` |

## Sources

- [goobook maintenance notice](https://pypi.org/project/goobook/)

## Migration

**Constraints**

- Preserve contact fields, address-book search, authentication, caching, and command output used by scripts.

**Steps**

1. **Select a maintained contacts client.** Choose a maintained Google Contacts or CardDAV client, export or preserve local state, and replace goobook commands and integrations.

**Verification**

- `python -m pytest`: Run contact lookup, synchronization, and repository tests when defined.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Same ecosystem

- [The aifc module was removed in Python 3.13](python.module.aifc.removed.html)
- [The asynchat module was removed in Python 3.12](python.module.asynchat.removed.html)
- [The asyncore module was removed in Python 3.12](python.module.asyncore.removed.html)
- [The audioop module was removed in Python 3.13](python.module.audioop.removed.html)
- [The cgi module was removed in Python 3.13](python.module.cgi.removed.html)
- [The cgitb module was removed in Python 3.13](python.module.cgitb.removed.html)
- [The chunk module was removed in Python 3.13](python.module.chunk.removed.html)
- [The crypt module was removed in Python 3.13](python.module.crypt.removed.html)


## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.goobook.eol`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/python.package.goobook.eol.html",
      "url": "https://arminazimi.github.io/evergreen/rules/python.package.goobook.eol.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.goobook.eol.html",
      "headline": "goobook is no longer maintained — dates, impact, migration",
      "description": "The maintainer states that the project is no longer maintained.",
      "inLanguage": "en",
      "dateModified": "2026-10-16",
      "keywords": [
        "end-of-life",
        "python",
        "medium"
      ],
      "about": {
        "@type": "Thing",
        "name": "goobook is no longer maintained",
        "identifier": "pkg:pypi/goobook"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "goobook maintenance notice",
          "url": "https://pypi.org/project/goobook/"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/python.package.goobook.eol.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/python.package.goobook.eol.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:pypi/goobook?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life. The source gives no day. Affected versions: vers:pypi/*. Source: goobook maintenance notice (https://pypi.org/project/goobook/)."
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:pypi/goobook?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:pypi/goobook."
          }
        }
      ]
    }
  ]
}
</script>
