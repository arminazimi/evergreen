---
title: "cryptiles is deprecated — dates, impact, migration"
description: "npm states that cryptiles moved to @hapi/cryptiles and that the old distribution is no longer maintained."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.cryptiles.deprecated.html"
json_twin: "/rules/npm.package.cryptiles.deprecated.json"
---

# cryptiles is deprecated

**Deprecated.** The source gives no day. Replacement: @hapi/cryptiles. Source: [cryptiles package deprecation notice](https://www.npmjs.com/package/cryptiles).

Check a version:

```bash
evergreen check pkg:npm/cryptiles
```

npm states that cryptiles moved to @hapi/cryptiles and that the old distribution is no longer maintained.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/cryptiles` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | @hapi/cryptiles |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.cryptiles.deprecated` |

## Sources

- [cryptiles package deprecation notice](https://www.npmjs.com/package/cryptiles)
- [cryptiles registry metadata](https://registry.npmjs.org/cryptiles/latest)

## Migration

**Constraints**

- Preserve random-token entropy, timing-safe comparisons, and cryptographic input and output encodings.

**Steps**

1. **Replace cryptiles.** Move the dependency and imports from cryptiles to @hapi/cryptiles and adapt changed APIs.
2. **Verify cryptographic behavior.** Exercise token generation and comparison paths with their existing encodings and lengths.

**Verification**

- `npm run test --if-present`: Run security-sensitive behavior and repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Same ecosystem

- [abab is deprecated](npm.package.abab.deprecated.html)
- [@angular/core v18 and older are no longer supported](npm.package.angular.core.v18-and-older.end-of-support.html)
- [@angular/core v19 is no longer supported](npm.package.angular.core.v19.end-of-support.html)
- [@angular/core v20 reaches end of life on 2026-11-28](npm.package.angular.core.v20.scheduled-end-of-life.html)
- [@angular/core v21 reaches end of life on 2027-06-30](npm.package.angular.core.v21.scheduled-end-of-life.html)
- [@angular/core v22 reaches end of life on 2028-06-30](npm.package.angular.core.v22.scheduled-end-of-life.html)
- [are-we-there-yet is no longer supported](npm.package.are-we-there-yet.eol.html)
- [babel-eslint is deprecated](npm.package.babel-eslint.deprecated.html)


## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.cryptiles.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.cryptiles.deprecated.html",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.cryptiles.deprecated.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.cryptiles.deprecated.html",
      "headline": "cryptiles is deprecated — dates, impact, migration",
      "description": "npm states that cryptiles moved to @hapi/cryptiles and that the old distribution is no longer maintained.",
      "inLanguage": "en",
      "dateModified": "2026-10-16",
      "keywords": [
        "deprecated",
        "npm",
        "medium"
      ],
      "about": {
        "@type": "Thing",
        "name": "cryptiles is deprecated",
        "identifier": "pkg:npm/cryptiles"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "cryptiles package deprecation notice",
          "url": "https://www.npmjs.com/package/cryptiles"
        },
        {
          "@type": "CreativeWork",
          "name": "cryptiles registry metadata",
          "url": "https://registry.npmjs.org/cryptiles/latest"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.cryptiles.deprecated.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.cryptiles.deprecated.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:npm/cryptiles?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated. The source gives no day. Affected versions: vers:npm/*. Source: cryptiles package deprecation notice (https://www.npmjs.com/package/cryptiles)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:npm/cryptiles?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "@hapi/cryptiles"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:npm/cryptiles?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:npm/cryptiles."
          }
        }
      ]
    }
  ]
}
</script>
