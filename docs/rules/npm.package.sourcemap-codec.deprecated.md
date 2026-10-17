---
title: "sourcemap-codec is deprecated"
description: "npm recommends replacing sourcemap-codec with @jridgewell/sourcemap-codec."
---

# sourcemap-codec is deprecated

npm recommends replacing sourcemap-codec with @jridgewell/sourcemap-codec.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/sourcemap-codec` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | @jridgewell/sourcemap-codec |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.sourcemap-codec.deprecated` |

## Sources

- [sourcemap-codec package deprecation notice](https://www.npmjs.com/package/sourcemap-codec)
- [sourcemap-codec registry metadata](https://registry.npmjs.org/sourcemap-codec/latest)

## Migration

**Constraints**

- Preserve decoded segment ordering, generated and original positions, names, empty lines, and encoded source-map output.

**Steps**

1. **Move to the maintained codec.** Replace the dependency and imports with @jridgewell/sourcemap-codec and adapt any changed exports.

**Verification**

- `npm run test --if-present`: Run source-map round-trip and repository tests.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.sourcemap-codec.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.sourcemap-codec.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.sourcemap-codec.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.sourcemap-codec.deprecated.html",
  "headline": "sourcemap-codec is deprecated",
  "description": "npm recommends replacing sourcemap-codec with @jridgewell/sourcemap-codec.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "deprecated",
    "npm",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "sourcemap-codec is deprecated",
    "identifier": "pkg:npm/sourcemap-codec"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "sourcemap-codec package deprecation notice",
      "url": "https://www.npmjs.com/package/sourcemap-codec"
    },
    {
      "@type": "CreativeWork",
      "name": "sourcemap-codec registry metadata",
      "url": "https://registry.npmjs.org/sourcemap-codec/latest"
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
