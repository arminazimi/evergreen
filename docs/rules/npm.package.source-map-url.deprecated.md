---
title: "source-map-url is deprecated — dates, impact, migration"
description: "The maintainer deprecated source-map-url and recommends convert-source-map for working with source map comments."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.source-map-url.deprecated.html"
json_twin: "/rules/npm.package.source-map-url.deprecated.json"
---

# source-map-url is deprecated

**Deprecated.** The source gives no day. Replacement: convert-source-map. Source: [source-map-url maintainer deprecation notice](https://github.com/lydell/source-map-url#deprecated).

Check a version:

```bash
evergreen check pkg:npm/source-map-url
```

The maintainer deprecated source-map-url and recommends convert-source-map for working with source map comments.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/source-map-url` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | convert-source-map |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.source-map-url.deprecated` |

## Sources

- [source-map-url maintainer deprecation notice](https://github.com/lydell/source-map-url#deprecated)
- [source-map-url registry metadata](https://registry.npmjs.org/source-map-url/latest)

## Migration

**Constraints**

- Preserve JavaScript and CSS comment forms, inline and external map URLs, insertion position, removal behavior, and malformed-input handling.

**Steps**

1. **Move to convert-source-map.** Replace source-map-url parsing and mutation calls with convert-source-map equivalents and explicit handling for any unsupported comment forms.

**Verification**

- `npm run test --if-present`: Run inline, external, JavaScript, CSS, malformed, and repository tests.

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

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.source-map-url.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.source-map-url.deprecated.html",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.source-map-url.deprecated.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.source-map-url.deprecated.html",
      "headline": "source-map-url is deprecated — dates, impact, migration",
      "description": "The maintainer deprecated source-map-url and recommends convert-source-map for working with source map comments.",
      "inLanguage": "en",
      "dateModified": "2026-10-16",
      "keywords": [
        "deprecated",
        "npm",
        "medium"
      ],
      "about": {
        "@type": "Thing",
        "name": "source-map-url is deprecated",
        "identifier": "pkg:npm/source-map-url"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "source-map-url maintainer deprecation notice",
          "url": "https://github.com/lydell/source-map-url#deprecated"
        },
        {
          "@type": "CreativeWork",
          "name": "source-map-url registry metadata",
          "url": "https://registry.npmjs.org/source-map-url/latest"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.source-map-url.deprecated.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.source-map-url.deprecated.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:npm/source-map-url?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated. The source gives no day. Affected versions: vers:npm/*. Source: source-map-url maintainer deprecation notice (https://github.com/lydell/source-map-url#deprecated)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:npm/source-map-url?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "convert-source-map"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:npm/source-map-url?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:npm/source-map-url."
          }
        }
      ]
    }
  ]
}
</script>
