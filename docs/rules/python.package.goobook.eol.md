---
title: "goobook is no longer maintained — dates, impact, migration"
description: "The maintainer states that the project is no longer maintained."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.package.goobook.eol.html"
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

- [agentops-toolkit was renamed and is no longer maintained](python.package.agentops-toolkit.eol.html)
- [aiohttp-valera-validator was renamed and is no longer maintained](python.package.aiohttp-valera-validator.eol.html)
- [api-shield is deprecated](python.package.api-shield.deprecated.html)
- [apisec-code-bolt was renamed](python.package.apisec-code-bolt.deprecated.html)
- [argparse is archived on PyPI](python.package.argparse.archived.html)
- [asyncio-requests is retired](python.package.asyncio-requests.deprecated.html)
- [BatchNotebook is deprecated](python.package.batchnotebook.deprecated.html)
- [cmip_ref was renamed and is no longer maintained](python.package.cmip-ref.eol.html)


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
