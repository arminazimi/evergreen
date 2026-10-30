---
title: "npmlog is no longer supported — dates, impact, migration"
description: "npm states that the npmlog package is no longer supported."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.npmlog.eol.html"
json_twin: "/rules/npm.package.npmlog.eol.json"
---

# npmlog is no longer supported

**End of life.** The source gives no day. Source: [npmlog package deprecation notice](https://www.npmjs.com/package/npmlog).

Check a version:

```bash
evergreen check pkg:npm/npmlog
```

npm states that the npmlog package is no longer supported.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `npm` |
| Component | `pkg:npm/npmlog` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.npmlog.eol` |

## Sources

- [npmlog package deprecation notice](https://www.npmjs.com/package/npmlog)
- [npmlog registry metadata](https://registry.npmjs.org/npmlog/latest)

## Migration

**Constraints**

- Preserve log levels, prefixes, headings, progress integration, stream routing, formatting, and quiet-mode behavior.

**Steps**

1. **Replace npmlog.** Select a maintained logger that covers the used behavior, translate configuration and calls, then remove npmlog.

**Verification**

- `npm run test --if-present`: Run logging output, level filtering, and repository tests.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.npmlog.eol`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.npmlog.eol.html",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.npmlog.eol.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.npmlog.eol.html",
      "headline": "npmlog is no longer supported — dates, impact, migration",
      "description": "npm states that the npmlog package is no longer supported.",
      "inLanguage": "en",
      "dateModified": "2026-10-16",
      "keywords": [
        "end-of-life",
        "npm",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "npmlog is no longer supported",
        "identifier": "pkg:npm/npmlog"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "npmlog package deprecation notice",
          "url": "https://www.npmjs.com/package/npmlog"
        },
        {
          "@type": "CreativeWork",
          "name": "npmlog registry metadata",
          "url": "https://registry.npmjs.org/npmlog/latest"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.npmlog.eol.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.npmlog.eol.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:npm/npmlog?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life. The source gives no day. Affected versions: vers:npm/*. Source: npmlog package deprecation notice (https://www.npmjs.com/package/npmlog)."
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:npm/npmlog?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:npm/npmlog."
          }
        }
      ]
    }
  ]
}
</script>
