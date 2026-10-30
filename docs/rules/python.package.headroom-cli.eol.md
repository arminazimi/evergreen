---
title: "headroom-cli was renamed and is no longer maintained — dates, impact, migration"
description: "The maintainer states that headroom-cli is no longer maintained and development continues as quotagauge."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.package.headroom-cli.eol.html"
image: "/assets/og/python.package.headroom-cli.eol.svg"
json_twin: "/rules/python.package.headroom-cli.eol.json"
---

# headroom-cli was renamed and is no longer maintained

**End of life.** The source gives no day. Replacement: quotagauge. Source: [headroom-cli rename and migration notice](https://pypi.org/project/headroom-cli/).

Check a version:

```bash
evergreen check pkg:pypi/headroom-cli
```

The maintainer states that headroom-cli is no longer maintained and development continues as quotagauge.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `python` |
| Component | `pkg:pypi/headroom-cli` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | quotagauge |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.headroom-cli.eol` |

## Sources

- [headroom-cli rename and migration notice](https://pypi.org/project/headroom-cli/)

## Migration

**Constraints**

- Preserve provider configuration, usage history, statusline and hook integration, CLI behavior, and the existing ~/.headroom state.

**Steps**

1. **Move to quotagauge.** Install quotagauge, run its initialization for configured providers, verify settings rewrites and state migration, then uninstall headroom-cli.

**Verification**

- `quotagauge init --all`: Initialize integrations and exercise the maintainer-provided state migration.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.headroom-cli.eol`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/python.package.headroom-cli.eol.html",
      "url": "https://arminazimi.github.io/evergreen/rules/python.package.headroom-cli.eol.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.headroom-cli.eol.html",
      "headline": "headroom-cli was renamed and is no longer maintained — dates, impact, migration",
      "description": "The maintainer states that headroom-cli is no longer maintained and development continues as quotagauge.",
      "inLanguage": "en",
      "dateModified": "2026-10-16",
      "keywords": [
        "end-of-life",
        "python",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "headroom-cli was renamed and is no longer maintained",
        "identifier": "pkg:pypi/headroom-cli"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "headroom-cli rename and migration notice",
          "url": "https://pypi.org/project/headroom-cli/"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/python.package.headroom-cli.eol.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/python.package.headroom-cli.eol.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:pypi/headroom-cli?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life. The source gives no day. Affected versions: vers:pypi/*. Source: headroom-cli rename and migration notice (https://pypi.org/project/headroom-cli/)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:pypi/headroom-cli?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "quotagauge"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:pypi/headroom-cli?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:pypi/headroom-cli."
          }
        }
      ]
    }
  ]
}
</script>
