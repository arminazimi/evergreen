---
title: "Deno 1.x is end-of-life — dates, impact, migration"
description: "Deno 1.x was superseded by Deno 2.0 (released October 2024). Deno 1.x is end-of-life and no longer receives feature updates or bug fixes."
canonical_url: "https://arminazimi.github.io/evergreen/rules/deno.runtime.eol-1.x.html"
json_twin: "/rules/deno.runtime.eol-1.x.json"
---

# Deno 1.x is end-of-life

**End of life** as of 2024-10-09. Replacement: Deno 2.0 or later. Source: [Deno 2.0.0 Release](https://github.com/denoland/deno/releases/tag/v2.0.0).

Check a version:

```bash
evergreen check pkg:generic/deno
```

Deno 1.x was superseded by Deno 2.0 (released October 2024). Deno 1.x is end-of-life and no longer receives feature updates or bug fixes.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `deno` |
| Component | `pkg:generic/deno` |
| Affected versions | `vers:semver/>=1.0.0\|<2.0.0` |
| Date from the source | 2024-10-09 |
| Replacement | Deno 2.0 or later |
| Evidence last seen | 2026-10-26 |
| Reviewed | 2026-10-26 by arminazimi |
| Review due | 2027-01-24 (90 days after the last review) |
| Rule ID | `deno.runtime.eol-1.x` |

## Sources

- [Deno 2.0.0 Release](https://github.com/denoland/deno/releases/tag/v2.0.0)

## Migration

**Constraints**

- Upgrade to Deno 2.0 or later while verifying compatibility with Deno 2 breaking changes.

**Steps**

1. **Upgrade Deno runtime.** Update the Deno version pin in deno.json, deno.jsonc, or environment setup to Deno 2.0 or later.

**Verification**

- `deno --version`: Confirm active Deno runtime version.

## Detected by

The `deno` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/deno.json`](https://github.com/arminazimi/evergreen/blob/main/registry/deno.json), rule `deno.runtime.eol-1.x`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/deno.runtime.eol-1.x.html",
      "url": "https://arminazimi.github.io/evergreen/rules/deno.runtime.eol-1.x.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/deno.runtime.eol-1.x.html",
      "headline": "Deno 1.x is end-of-life — dates, impact, migration",
      "description": "Deno 1.x was superseded by Deno 2.0 (released October 2024). Deno 1.x is end-of-life and no longer receives feature updates or bug fixes.",
      "inLanguage": "en",
      "dateModified": "2026-10-26",
      "keywords": [
        "end-of-life",
        "deno",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "Deno 1.x is end-of-life",
        "identifier": "pkg:generic/deno"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Deno 2.0.0 Release",
          "url": "https://github.com/denoland/deno/releases/tag/v2.0.0"
        }
      ],
      "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/deno.json",
      "publisher": {
        "@type": "Organization",
        "name": "Evergreen",
        "url": "https://arminazimi.github.io/evergreen"
      }
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/deno.runtime.eol-1.x.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/deno.runtime.eol-1.x.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/deno?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life as of 2024-10-09. Affected versions: vers:semver/>=1.0.0|\u003c2.0.0. Source: Deno 2.0.0 Release (https://github.com/denoland/deno/releases/tag/v2.0.0)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/deno?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deno 2.0 or later"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/deno?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/deno."
          }
        }
      ]
    }
  ]
}
</script>
