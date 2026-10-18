---
title: "istanbul is deprecated — dates, impact, migration"
description: "npm states that istanbul is no longer maintained and recommends nyc."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.istanbul.deprecated.html"
---

# istanbul is deprecated

npm states that istanbul is no longer maintained and recommends nyc.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/istanbul` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | nyc |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.istanbul.deprecated` |

## Sources

- [istanbul package deprecation notice](https://www.npmjs.com/package/istanbul)
- [istanbul registry metadata](https://registry.npmjs.org/istanbul/latest)

## Migration

**Constraints**

- Preserve test execution, include and exclude patterns, source maps, reporters, and coverage thresholds.

**Steps**

1. **Replace Istanbul CLI.** Replace istanbul with nyc in dependencies, scripts, and coverage configuration.
2. **Compare coverage output.** Run the same test suite and compare covered files, reporters, and enforced thresholds.

**Verification**

- `npm run test --if-present`: Run the instrumented test suite and coverage checks.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.istanbul.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.istanbul.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.istanbul.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.istanbul.deprecated.html",
  "headline": "istanbul is deprecated — dates, impact, migration",
  "description": "npm states that istanbul is no longer maintained and recommends nyc.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "deprecated",
    "npm",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "istanbul is deprecated",
    "identifier": "pkg:npm/istanbul"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "istanbul package deprecation notice",
      "url": "https://www.npmjs.com/package/istanbul"
    },
    {
      "@type": "CreativeWork",
      "name": "istanbul registry metadata",
      "url": "https://registry.npmjs.org/istanbul/latest"
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
