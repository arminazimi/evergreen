---
title: "source-map-url is deprecated"
description: "The maintainer deprecated source-map-url and recommends convert-source-map for working with source map comments."
---

# source-map-url is deprecated

The maintainer deprecated source-map-url and recommends convert-source-map for working with source map comments.

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

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.source-map-url.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.source-map-url.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.source-map-url.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.source-map-url.deprecated.html",
  "headline": "source-map-url is deprecated",
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
}
</script>
