---
title: "ghops is deprecated and no longer maintained — dates, impact, migration"
description: "The maintainer states that ghops is deprecated and no longer maintained, and directs users to repoindex."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.package.ghops.eol.html"
json_twin: "/rules/python.package.ghops.eol.json"
---

# ghops is deprecated and no longer maintained

**End of life.** The source gives no day. Replacement: repoindex. Source: [ghops deprecation notice](https://pypi.org/project/ghops/).

Check a version:

```bash
evergreen check pkg:pypi/ghops
```

The maintainer states that ghops is deprecated and no longer maintained, and directs users to repoindex.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `python` |
| Component | `pkg:pypi/ghops` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | repoindex |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.ghops.eol` |

## Sources

- [ghops deprecation notice](https://pypi.org/project/ghops/)

## Migration

**Constraints**

- Preserve repository discovery, grouping, metadata, configuration, command output, and any persisted collection state.

**Steps**

1. **Move to repoindex.** Replace ghops with repoindex, translate configuration and commands, and migrate any persisted repository collection data.

**Verification**

- `python -m pytest`: Run repository discovery, metadata, command, and project tests when defined.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.ghops.eol`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/python.package.ghops.eol.html",
      "url": "https://arminazimi.github.io/evergreen/rules/python.package.ghops.eol.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.ghops.eol.html",
      "headline": "ghops is deprecated and no longer maintained — dates, impact, migration",
      "description": "The maintainer states that ghops is deprecated and no longer maintained, and directs users to repoindex.",
      "inLanguage": "en",
      "dateModified": "2026-10-16",
      "keywords": [
        "end-of-life",
        "python",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "ghops is deprecated and no longer maintained",
        "identifier": "pkg:pypi/ghops"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "ghops deprecation notice",
          "url": "https://pypi.org/project/ghops/"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/python.package.ghops.eol.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/python.package.ghops.eol.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:pypi/ghops?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life. The source gives no day. Affected versions: vers:pypi/*. Source: ghops deprecation notice (https://pypi.org/project/ghops/)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:pypi/ghops?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "repoindex"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:pypi/ghops?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:pypi/ghops."
          }
        }
      ]
    }
  ]
}
</script>
