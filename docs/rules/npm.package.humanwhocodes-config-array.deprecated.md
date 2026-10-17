---
title: "@humanwhocodes/config-array is deprecated"
description: "npm recommends replacing @humanwhocodes/config-array with @eslint/config-array."
---

# @humanwhocodes/config-array is deprecated

npm recommends replacing @humanwhocodes/config-array with @eslint/config-array.

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

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.humanwhocodes-config-array.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.humanwhocodes-config-array.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.humanwhocodes-config-array.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.humanwhocodes-config-array.deprecated.html",
  "headline": "@humanwhocodes/config-array is deprecated",
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
}
</script>
