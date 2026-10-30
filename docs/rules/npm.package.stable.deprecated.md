---
title: "stable is deprecated — dates, impact, migration"
description: "npm states that modern JavaScript engines already provide stable Array.prototype.sort behavior, so the stable package is deprecated."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.stable.deprecated.html"
json_twin: "/rules/npm.package.stable.deprecated.json"
---

# stable is deprecated

npm states that modern JavaScript engines already provide stable Array.prototype.sort behavior, so the stable package is deprecated.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/stable` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | Array.prototype.sort |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.stable.deprecated` |

## Sources

- [stable package deprecation notice](https://www.npmjs.com/package/stable)
- [stable registry metadata](https://registry.npmjs.org/stable/latest)

## Migration

**Constraints**

- Preserve comparator behavior, input mutation, output ordering, and support for the project's minimum JavaScript runtime.

**Steps**

1. **Use native stable sorting.** Replace stable package calls with Array.prototype.sort using the same comparator, then remove the dependency.

**Verification**

- `npm run test --if-present`: Run ordering and repository tests on every supported runtime.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.stable.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.stable.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.stable.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.stable.deprecated.html",
  "headline": "stable is deprecated — dates, impact, migration",
  "description": "npm states that modern JavaScript engines already provide stable Array.prototype.sort behavior, so the stable package is deprecated.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "deprecated",
    "npm",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "stable is deprecated",
    "identifier": "pkg:npm/stable"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "stable package deprecation notice",
      "url": "https://www.npmjs.com/package/stable"
    },
    {
      "@type": "CreativeWork",
      "name": "stable registry metadata",
      "url": "https://registry.npmjs.org/stable/latest"
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
