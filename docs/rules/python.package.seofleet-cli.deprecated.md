---
title: "seofleet-cli is deprecated — dates, impact, migration"
description: "The maintainer renamed seofleet-cli to llmscout-cli and states that no further releases will be published under the old name."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.package.seofleet-cli.deprecated.html"
image: "/assets/og/python.package.seofleet-cli.deprecated.svg"
json_twin: "/rules/python.package.seofleet-cli.deprecated.json"
---

# seofleet-cli is deprecated

**Deprecated.** The source gives no day. Replacement: llmscout-cli. Source: [seofleet-cli deprecation notice](https://pypi.org/project/seofleet-cli/).

Check a version:

```bash
evergreen check pkg:pypi/seofleet-cli
```

The maintainer renamed seofleet-cli to llmscout-cli and states that no further releases will be published under the old name.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `python` |
| Component | `pkg:pypi/seofleet-cli` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | llmscout-cli |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.seofleet-cli.deprecated` |

## Sources

- [seofleet-cli deprecation notice](https://pypi.org/project/seofleet-cli/)

## Migration

**Constraints**

- Preserve scan targets, configured checks, output formats, exit codes, and CI invocation.

**Steps**

1. **Replace seofleet-cli.** Replace the distribution and CLI invocation with llmscout-cli, then migrate configuration using the current project documentation.

**Verification**

- `python -m pytest`: Run CLI integration and repository tests when defined.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.seofleet-cli.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/python.package.seofleet-cli.deprecated.html",
      "url": "https://arminazimi.github.io/evergreen/rules/python.package.seofleet-cli.deprecated.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.seofleet-cli.deprecated.html",
      "headline": "seofleet-cli is deprecated — dates, impact, migration",
      "description": "The maintainer renamed seofleet-cli to llmscout-cli and states that no further releases will be published under the old name.",
      "inLanguage": "en",
      "dateModified": "2026-10-16",
      "keywords": [
        "deprecated",
        "python",
        "medium"
      ],
      "about": {
        "@type": "Thing",
        "name": "seofleet-cli is deprecated",
        "identifier": "pkg:pypi/seofleet-cli"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "seofleet-cli deprecation notice",
          "url": "https://pypi.org/project/seofleet-cli/"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/python.package.seofleet-cli.deprecated.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/python.package.seofleet-cli.deprecated.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:pypi/seofleet-cli?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated. The source gives no day. Affected versions: vers:pypi/*. Source: seofleet-cli deprecation notice (https://pypi.org/project/seofleet-cli/)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:pypi/seofleet-cli?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "llmscout-cli"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:pypi/seofleet-cli?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:pypi/seofleet-cli."
          }
        }
      ]
    }
  ]
}
</script>
