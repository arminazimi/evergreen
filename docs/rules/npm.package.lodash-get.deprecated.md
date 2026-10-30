---
title: "lodash.get is deprecated — dates, impact, migration"
description: "npm recommends replacing lodash.get with JavaScript's optional chaining operator."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.lodash-get.deprecated.html"
json_twin: "/rules/npm.package.lodash-get.deprecated.json"
---

# lodash.get is deprecated

**Deprecated.** The source gives no day. Replacement: Optional chaining (?.). Source: [lodash.get package deprecation notice](https://www.npmjs.com/package/lodash.get).

Check a version:

```bash
evergreen check pkg:npm/lodash.get
```

npm recommends replacing lodash.get with JavaScript's optional chaining operator.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/lodash.get` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | Optional chaining (?.) |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.lodash-get.deprecated` |

## Sources

- [lodash.get package deprecation notice](https://www.npmjs.com/package/lodash.get)
- [lodash.get registry metadata](https://registry.npmjs.org/lodash.get/latest)

## Migration

**Constraints**

- Preserve path semantics, array-index access, default-value behavior, nullish handling, and minimum-runtime support.

**Steps**

1. **Use optional chaining.** Rewrite each lodash.get call with optional chaining and nullish coalescing where a default value is required, then remove the dependency.

**Verification**

- `npm run test --if-present`: Run nested access, default-value, nullish, and repository tests.

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

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.lodash-get.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.lodash-get.deprecated.html",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.lodash-get.deprecated.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.lodash-get.deprecated.html",
      "headline": "lodash.get is deprecated — dates, impact, migration",
      "description": "npm recommends replacing lodash.get with JavaScript's optional chaining operator.",
      "inLanguage": "en",
      "dateModified": "2026-10-16",
      "keywords": [
        "deprecated",
        "npm",
        "medium"
      ],
      "about": {
        "@type": "Thing",
        "name": "lodash.get is deprecated",
        "identifier": "pkg:npm/lodash.get"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "lodash.get package deprecation notice",
          "url": "https://www.npmjs.com/package/lodash.get"
        },
        {
          "@type": "CreativeWork",
          "name": "lodash.get registry metadata",
          "url": "https://registry.npmjs.org/lodash.get/latest"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.lodash-get.deprecated.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.lodash-get.deprecated.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:npm/lodash.get?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated. The source gives no day. Affected versions: vers:npm/*. Source: lodash.get package deprecation notice (https://www.npmjs.com/package/lodash.get)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:npm/lodash.get?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Optional chaining (?.)"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:npm/lodash.get?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:npm/lodash.get."
          }
        }
      ]
    }
  ]
}
</script>
