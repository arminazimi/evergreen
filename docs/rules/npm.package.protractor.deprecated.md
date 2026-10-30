---
title: "Protractor is deprecated — dates, impact, migration"
description: "The Protractor maintainers deprecated the package and announced end-of-life for Summer 2023."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.protractor.deprecated.html"
---

# Protractor is deprecated

**Deprecated.** The source gives no day. Source: [protractor package deprecation notice](https://www.npmjs.com/package/protractor).

Check a version:

```bash
evergreen check pkg:npm/protractor
```

The Protractor maintainers deprecated the package and announced end-of-life for Summer 2023.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | high |
| Ecosystem | `npm` |
| Component | `pkg:npm/protractor` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.protractor.deprecated` |

## Sources

- [protractor package deprecation notice](https://www.npmjs.com/package/protractor)
- [protractor registry metadata](https://registry.npmjs.org/protractor/latest)

## Migration

**Constraints**

- Preserve end-to-end coverage, browser matrix, selectors, waits, authentication state, screenshots, retries, and CI artifacts.

**Steps**

1. **Select a maintained end-to-end runner.** Choose a maintained runner that supports the browsers, environments, and test capabilities the suite requires.
2. **Migrate the Protractor suite.** Translate configuration, page objects, selectors, waits, assertions, and CI commands incrementally to the selected runner.

**Verification**

- `npm run test --if-present`: Run the migrated end-to-end suite and repository tests.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.protractor.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.protractor.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.protractor.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.protractor.deprecated.html",
  "headline": "Protractor is deprecated — dates, impact, migration",
  "description": "The Protractor maintainers deprecated the package and announced end-of-life for Summer 2023.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "deprecated",
    "npm",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Protractor is deprecated",
    "identifier": "pkg:npm/protractor"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "protractor package deprecation notice",
      "url": "https://www.npmjs.com/package/protractor"
    },
    {
      "@type": "CreativeWork",
      "name": "protractor registry metadata",
      "url": "https://registry.npmjs.org/protractor/latest"
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
