---
title: "babel-eslint is deprecated — dates, impact, migration"
description: "npm marks babel-eslint as deprecated: \"babel-eslint is now @babel/eslint-parser. This package will no longer receive updates.\""
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.babel-eslint.deprecated.html"
---

# babel-eslint is deprecated

npm marks babel-eslint as deprecated: "babel-eslint is now @babel/eslint-parser. This package will no longer receive updates."

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/babel-eslint` |
| Affected versions | `vers:npm/1.0.0\|1.0.1\|1.0.2\|1.0.3\|1.0.4\|1.0.6\|1.0.7\|1.0.8\|1.0.9\|1.0.10\|1.0.11\|1.0.12\|1.0.13\|1.0.14\|2.0.0\|2.0.2\|3.0.0\|3.0.1\|3.1.0\|3.1.1\|3.1.3\|3.1.4\|3.1.5\|3.1.6\|3.1.7\|3.1.8\|3.1.9\|3.1.10\|3.1.11\|3.1.12\|3.1.13\|3.1.14\|3.1.15\|3.1.16\|3.1.17\|3.1.18\|3.1.19\|3.1.20\|3.1.21\|3.1.22\|3.1.23\|3.1.24\|3.1.25\|3.1.26\|3.1.27\|3.1.28\|3.1.29\|3.1.30\|4.0.0\|4.0.1\|4.0.2\|4.0.3\|4.0.4\|4.0.5\|4.0.6\|4.0.7\|4.0.8\|4.0.9\|4.0.10\|4.1.0\|4.1.1\|4.1.2\|4.1.3\|4.1.4\|4.1.5\|4.1.6\|4.1.7\|4.1.8\|5.0.0\|5.0.1\|5.0.2\|5.0.3\|5.0.4\|6.0.0\|6.0.1\|6.0.2\|6.0.3\|6.0.4\|6.0.5\|6.1.0\|6.1.1\|6.1.2\|7.0.0\|7.1.0\|7.1.1\|7.2.0\|7.2.1\|7.2.2\|7.2.3\|8.0.0\|8.0.1\|8.0.2\|8.0.3\|8.1.0\|8.1.1\|8.1.2\|8.2.0\|8.2.1\|8.2.2\|8.2.3\|8.2.4\|8.2.5\|8.2.6\|9.0.0\|10.0.0\|10.0.1\|10.0.2\|10.0.3\|10.1.0\|11.0.0-beta.0\|11.0.0-beta.1\|11.0.0-beta.2` |
| Date from the source | The source gives no day |
| Replacement | @babel/eslint-parser |
| Evidence last seen | 2026-10-17 |
| Reviewed | 2026-10-17 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-17 (365 days after the last review) |
| Rule ID | `npm.package.babel-eslint.deprecated` |

## Sources

- [babel-eslint on npm](https://www.npmjs.com/package/babel-eslint)
- [babel-eslint version metadata](https://registry.npmjs.org/babel-eslint)

## Migration

**Constraints**

- Keep the same parser options, lint rules, and supported syntax (decorators, class properties, Flow) in the new parser configuration.

**Steps**

1. **Replace the parser package.** Replace babel-eslint with @babel/eslint-parser in dependencies and set the ESLint parser to @babel/eslint-parser.
2. **Provide a Babel configuration.** @babel/eslint-parser needs a Babel config (or requireConfigFile: false with parserOptions.babelOptions); add one so the same syntax parses.

**Verification**

- `npm run lint --if-present`: Run the linter with the new parser and compare the results.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.babel-eslint.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.babel-eslint.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.babel-eslint.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.babel-eslint.deprecated.html",
  "headline": "babel-eslint is deprecated — dates, impact, migration",
  "description": "npm marks babel-eslint as deprecated: \"babel-eslint is now @babel/eslint-parser. This package will no longer receive updates.\"",
  "inLanguage": "en",
  "dateModified": "2026-10-17",
  "keywords": [
    "deprecated",
    "npm",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "babel-eslint is deprecated",
    "identifier": "pkg:npm/babel-eslint"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "babel-eslint on npm",
      "url": "https://www.npmjs.com/package/babel-eslint"
    },
    {
      "@type": "CreativeWork",
      "name": "babel-eslint version metadata",
      "url": "https://registry.npmjs.org/babel-eslint"
    }
  ],
  "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/npm.json",
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen"
  }
}
</script>
