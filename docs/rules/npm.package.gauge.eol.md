---
title: "gauge is no longer supported — dates, impact, migration"
description: "npm states that the gauge package is no longer supported."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.gauge.eol.html"
image: "/assets/og/npm.package.gauge.eol.svg"
json_twin: "/rules/npm.package.gauge.eol.json"
---

# gauge is no longer supported

**End of life.** The source gives no day. Source: [gauge package deprecation notice](https://www.npmjs.com/package/gauge).

Check a version:

```bash
evergreen check pkg:npm/gauge
```

npm states that the gauge package is no longer supported.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `npm` |
| Component | `pkg:npm/gauge` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.gauge.eol` |

## Sources

- [gauge package deprecation notice](https://www.npmjs.com/package/gauge)
- [gauge registry metadata](https://registry.npmjs.org/gauge/latest)

## Migration

**Constraints**

- Preserve terminal detection, redraw behavior, themes, templates, progress values, status sections, and non-TTY output.

**Steps**

1. **Replace the terminal gauge.** Select a maintained terminal progress implementation, migrate rendering and update calls, then remove gauge.

**Verification**

- `npm run test --if-present`: Run TTY, non-TTY, redraw, and repository tests.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.gauge.eol`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.gauge.eol.html",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.gauge.eol.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.gauge.eol.html",
      "headline": "gauge is no longer supported — dates, impact, migration",
      "description": "npm states that the gauge package is no longer supported.",
      "inLanguage": "en",
      "dateModified": "2026-10-16",
      "keywords": [
        "end-of-life",
        "npm",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "gauge is no longer supported",
        "identifier": "pkg:npm/gauge"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "gauge package deprecation notice",
          "url": "https://www.npmjs.com/package/gauge"
        },
        {
          "@type": "CreativeWork",
          "name": "gauge registry metadata",
          "url": "https://registry.npmjs.org/gauge/latest"
        }
      ],
      "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/npm.json",
      "publisher": {
        "@type": "Organization",
        "name": "Evergreen",
        "url": "https://arminazimi.github.io/evergreen"
      }
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.gauge.eol.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.gauge.eol.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:npm/gauge?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life. The source gives no day. Affected versions: vers:npm/*. Source: gauge package deprecation notice (https://www.npmjs.com/package/gauge)."
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:npm/gauge?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:npm/gauge."
          }
        }
      ]
    }
  ]
}
</script>
