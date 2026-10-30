---
title: "sntp is deprecated — dates, impact, migration"
description: "npm states that sntp moved to @hapi/sntp and that the old distribution is no longer supported."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.sntp.deprecated.html"
image: "/assets/og/npm.package.sntp.deprecated.svg"
json_twin: "/rules/npm.package.sntp.deprecated.json"
---

# sntp is deprecated

**Deprecated.** The source gives no day. Replacement: @hapi/sntp. Source: [sntp package deprecation notice](https://www.npmjs.com/package/sntp).

Check a version:

```bash
evergreen check pkg:npm/sntp
```

npm states that sntp moved to @hapi/sntp and that the old distribution is no longer supported.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | high |
| Ecosystem | `npm` |
| Component | `pkg:npm/sntp` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | @hapi/sntp |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.sntp.deprecated` |

## Sources

- [sntp package deprecation notice](https://www.npmjs.com/package/sntp)
- [sntp registry metadata](https://registry.npmjs.org/sntp/latest)

## Migration

**Constraints**

- Preserve server selection, timeout behavior, clock-offset calculations, error handling, and any security-sensitive time checks.

**Steps**

1. **Replace sntp.** Move the dependency and imports from sntp to @hapi/sntp and adapt changed APIs.
2. **Verify network-time behavior.** Test successful queries, timeouts, invalid responses, and clock-offset handling with controlled fixtures.

**Verification**

- `npm run test --if-present`: Run time synchronization and repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.sntp.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.sntp.deprecated.html",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.sntp.deprecated.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.sntp.deprecated.html",
      "headline": "sntp is deprecated — dates, impact, migration",
      "description": "npm states that sntp moved to @hapi/sntp and that the old distribution is no longer supported.",
      "inLanguage": "en",
      "dateModified": "2026-10-16",
      "keywords": [
        "deprecated",
        "npm",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "sntp is deprecated",
        "identifier": "pkg:npm/sntp"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "sntp package deprecation notice",
          "url": "https://www.npmjs.com/package/sntp"
        },
        {
          "@type": "CreativeWork",
          "name": "sntp registry metadata",
          "url": "https://registry.npmjs.org/sntp/latest"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.sntp.deprecated.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.sntp.deprecated.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:npm/sntp?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated. The source gives no day. Affected versions: vers:npm/*. Source: sntp package deprecation notice (https://www.npmjs.com/package/sntp)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:npm/sntp?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "@hapi/sntp"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:npm/sntp?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:npm/sntp."
          }
        }
      ]
    }
  ]
}
</script>
