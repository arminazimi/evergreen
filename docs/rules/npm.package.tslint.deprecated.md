---
title: "tslint is deprecated — dates, impact, migration"
description: "npm marks tslint as deprecated: \"TSLint has been deprecated in favor of ESLint. Please see https://github.com/palantir/tslint/issues/4534 for more information.\""
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.tslint.deprecated.html"
json_twin: "/rules/npm.package.tslint.deprecated.json"
---

# tslint is deprecated

**Deprecated.** The source gives no day. Replacement: ESLint with typescript-eslint. Source: [tslint on npm](https://www.npmjs.com/package/tslint).

Check a version:

```bash
evergreen check pkg:npm/tslint
```

npm marks tslint as deprecated: "TSLint has been deprecated in favor of ESLint. Please see https://github.com/palantir/tslint/issues/4534 for more information."

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/tslint` |
| Affected versions | `vers:npm/6.0.0\|6.1.0\|6.1.1\|6.1.2\|6.1.3` |
| Date from the source | The source gives no day |
| Replacement | ESLint with typescript-eslint |
| Evidence last seen | 2026-10-17 |
| Reviewed | 2026-10-17 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-17 (365 days after the last review) |
| Rule ID | `npm.package.tslint.deprecated` |

## Sources

- [tslint on npm](https://www.npmjs.com/package/tslint)
- [tslint version metadata](https://registry.npmjs.org/tslint)

## Migration

**Constraints**

- Preserve the enforced rule set and any custom rules; map each TSLint rule to its typescript-eslint or ESLint equivalent.

**Steps**

1. **Replace TSLint with ESLint.** Replace tslint with eslint and typescript-eslint in dependencies and scripts, and port the rules from tslint.json to the ESLint configuration.
2. **Port custom rules and disables.** Convert `tslint:disable` comments and any custom TSLint rules to their ESLint equivalents.

**Verification**

- `npm run lint --if-present`: Run the new linter on the project and compare the findings.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.tslint.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.tslint.deprecated.html",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.tslint.deprecated.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.tslint.deprecated.html",
      "headline": "tslint is deprecated — dates, impact, migration",
      "description": "npm marks tslint as deprecated: \"TSLint has been deprecated in favor of ESLint. Please see https://github.com/palantir/tslint/issues/4534 for more information.\"",
      "inLanguage": "en",
      "dateModified": "2026-10-17",
      "keywords": [
        "deprecated",
        "npm",
        "medium"
      ],
      "about": {
        "@type": "Thing",
        "name": "tslint is deprecated",
        "identifier": "pkg:npm/tslint"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "tslint on npm",
          "url": "https://www.npmjs.com/package/tslint"
        },
        {
          "@type": "CreativeWork",
          "name": "tslint version metadata",
          "url": "https://registry.npmjs.org/tslint"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.tslint.deprecated.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.tslint.deprecated.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:npm/tslint?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated. The source gives no day. Affected versions: vers:npm/6.0.0|6.1.0|6.1.1|6.1.2|6.1.3. Source: tslint on npm (https://www.npmjs.com/package/tslint)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:npm/tslint?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "ESLint with typescript-eslint"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:npm/tslint?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:npm/tslint."
          }
        }
      ]
    }
  ]
}
</script>
