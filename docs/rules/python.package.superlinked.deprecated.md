---
title: "superlinked is deprecated for new projects — dates, impact, migration"
description: "Superlinked marks its legacy Python framework deprecated for new projects and directs new development to SIE and sie-sdk."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.package.superlinked.deprecated.html"
image: "/assets/og/python.package.superlinked.deprecated.svg"
json_twin: "/rules/python.package.superlinked.deprecated.json"
---

# superlinked is deprecated for new projects

**Deprecated.** The source gives no day. Replacement: SIE and sie-sdk. Source: [superlinked legacy framework notice](https://pypi.org/project/superlinked/).

Check a version:

```bash
evergreen check pkg:pypi/superlinked
```

Superlinked marks its legacy Python framework deprecated for new projects and directs new development to SIE and sie-sdk.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `python` |
| Component | `pkg:pypi/superlinked` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | SIE and sie-sdk |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.superlinked.deprecated` |

## Sources

- [superlinked legacy framework notice](https://pypi.org/project/superlinked/)

## Migration

**Constraints**

- SIE is not a drop-in replacement; preserve schemas, indexing, storage, vector search, query weighting, model behavior, and deployment requirements explicitly.

**Steps**

1. **Redesign on SIE where appropriate.** Map legacy framework responsibilities to SIE Server and sie-sdk, redesign incompatible application layers, migrate data and queries, then remove superlinked only after parity is proven.

**Verification**

- `python -m pytest`: Run indexing, retrieval, ranking, storage, deployment, and project tests when defined.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.superlinked.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/python.package.superlinked.deprecated.html",
      "url": "https://arminazimi.github.io/evergreen/rules/python.package.superlinked.deprecated.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.superlinked.deprecated.html",
      "headline": "superlinked is deprecated for new projects — dates, impact, migration",
      "description": "Superlinked marks its legacy Python framework deprecated for new projects and directs new development to SIE and sie-sdk.",
      "inLanguage": "en",
      "dateModified": "2026-10-16",
      "keywords": [
        "deprecated",
        "python",
        "medium"
      ],
      "about": {
        "@type": "Thing",
        "name": "superlinked is deprecated for new projects",
        "identifier": "pkg:pypi/superlinked"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "superlinked legacy framework notice",
          "url": "https://pypi.org/project/superlinked/"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/python.package.superlinked.deprecated.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/python.package.superlinked.deprecated.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:pypi/superlinked?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated. The source gives no day. Affected versions: vers:pypi/*. Source: superlinked legacy framework notice (https://pypi.org/project/superlinked/)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:pypi/superlinked?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "SIE and sie-sdk"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:pypi/superlinked?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:pypi/superlinked."
          }
        }
      ]
    }
  ]
}
</script>
