---
title: "@humanwhocodes/config-array is deprecated — dates, impact, migration"
description: "npm recommends replacing @humanwhocodes/config-array with @eslint/config-array."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.humanwhocodes-config-array.deprecated.html"
json_twin: "/rules/npm.package.humanwhocodes-config-array.deprecated.json"
---

# @humanwhocodes/config-array is deprecated

**Deprecated.** The source gives no day. Replacement: @eslint/config-array. Source: [@humanwhocodes/config-array package deprecation notice](https://www.npmjs.com/package/@humanwhocodes/config-array).

Check a version:

```bash
evergreen check pkg:npm/%40humanwhocodes/config-array
```

npm recommends replacing @humanwhocodes/config-array with @eslint/config-array.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/%40humanwhocodes/config-array` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | @eslint/config-array |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.humanwhocodes-config-array.deprecated` |

## Sources

- [@humanwhocodes/config-array package deprecation notice](https://www.npmjs.com/package/@humanwhocodes/config-array)
- [@humanwhocodes/config-array registry metadata](https://registry.npmjs.org/@humanwhocodes%2Fconfig-array/latest)

## Migration

**Constraints**

- Preserve config matching, normalization, naming, ignore handling, cache behavior, and exported API semantics.

**Steps**

1. **Move to the ESLint package.** Replace the dependency and imports with @eslint/config-array, then adapt renamed or changed exports using its maintained API.

**Verification**

- `npm run test --if-present`: Run configuration selection and repository tests.

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

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.humanwhocodes-config-array.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.humanwhocodes-config-array.deprecated.html",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.humanwhocodes-config-array.deprecated.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.humanwhocodes-config-array.deprecated.html",
      "headline": "@humanwhocodes/config-array is deprecated — dates, impact, migration",
      "description": "npm recommends replacing @humanwhocodes/config-array with @eslint/config-array.",
      "inLanguage": "en",
      "dateModified": "2026-10-16",
      "keywords": [
        "deprecated",
        "npm",
        "medium"
      ],
      "about": {
        "@type": "Thing",
        "name": "@humanwhocodes/config-array is deprecated",
        "identifier": "pkg:npm/%40humanwhocodes/config-array"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "@humanwhocodes/config-array package deprecation notice",
          "url": "https://www.npmjs.com/package/@humanwhocodes/config-array"
        },
        {
          "@type": "CreativeWork",
          "name": "@humanwhocodes/config-array registry metadata",
          "url": "https://registry.npmjs.org/@humanwhocodes%2Fconfig-array/latest"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.humanwhocodes-config-array.deprecated.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.humanwhocodes-config-array.deprecated.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:npm/%40humanwhocodes/config-array?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated. The source gives no day. Affected versions: vers:npm/*. Source: @humanwhocodes/config-array package deprecation notice (https://www.npmjs.com/package/@humanwhocodes/config-array)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:npm/%40humanwhocodes/config-array?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "@eslint/config-array"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:npm/%40humanwhocodes/config-array?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:npm/%40humanwhocodes/config-array."
          }
        }
      ]
    }
  ]
}
</script>
