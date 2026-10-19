---
title: "node-pre-gyp is deprecated — dates, impact, migration"
description: "npm states that the unscoped node-pre-gyp package is deprecated and only @mapbox/node-pre-gyp will receive updates."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.node-pre-gyp.deprecated.html"
---

# node-pre-gyp is deprecated

npm states that the unscoped node-pre-gyp package is deprecated and only @mapbox/node-pre-gyp will receive updates.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | high |
| Ecosystem | `npm` |
| Component | `pkg:npm/node-pre-gyp` |
| Affected versions | `vers:npm/0.1.0\|0.1.1\|0.1.2\|0.1.3\|0.1.4\|0.1.5\|0.1.6\|0.1.7\|0.1.8\|0.1.9\|0.2.1\|0.2.2\|0.2.3\|0.2.4\|0.2.5\|0.2.6\|0.3.0\|0.3.1\|0.4.0\|0.4.1\|0.4.2\|0.5.0\|0.5.1\|0.5.2\|0.5.3\|0.5.4\|0.5.5\|0.5.6\|0.5.8\|0.5.9\|0.5.10\|0.5.11\|0.5.12\|0.5.13\|0.5.14\|0.5.15\|0.5.16\|0.5.17\|0.5.18\|0.5.19\|0.5.20\|0.5.21\|0.5.22\|0.5.23\|0.5.24\|0.5.25\|0.5.26\|0.5.27\|0.5.28\|0.5.29\|0.5.30\|0.5.31\|0.6.0\|0.6.1\|0.6.2\|0.6.3\|0.6.4\|0.6.5\|0.6.6\|0.6.7\|0.6.8\|0.6.9\|0.6.10\|0.6.11\|0.6.12\|0.6.13\|0.6.14\|0.6.15\|0.6.16\|0.6.17\|0.6.18\|0.6.19\|0.6.20\|0.6.21\|0.6.22\|0.6.23\|0.6.24\|0.6.25\|0.6.26\|0.6.27\|0.6.28\|0.6.29\|0.6.30\|0.6.31\|0.6.32\|0.6.33\|0.6.34\|0.6.35\|0.6.36\|0.6.37\|0.6.38\|0.6.39\|0.7.0\|0.8.0\|0.9.0\|0.9.1\|0.10.0\|0.10.1\|0.10.2\|0.10.3\|0.11.0\|0.12.0\|0.13.0\|0.14.0\|0.15.0\|0.16.0\|0.17.0` |
| Date from the source | The source gives no day |
| Replacement | @mapbox/node-pre-gyp |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.node-pre-gyp.deprecated` |

## Sources

- [node-pre-gyp package deprecation notice](https://www.npmjs.com/package/node-pre-gyp)
- [node-pre-gyp version metadata](https://registry.npmjs.org/node-pre-gyp)

## Migration

**Constraints**

- Preserve native-binary download locations, ABI selection, source-build fallback, install scripts, and publishing behavior.

**Steps**

1. **Replace node-pre-gyp.** Move the dependency, scripts, imports, and binary configuration from node-pre-gyp to @mapbox/node-pre-gyp.
2. **Verify native package installation.** Test prebuilt-binary download and source-build fallback on every supported platform and Node.js ABI.

**Verification**

- `npm run build --if-present`: Build or install the native package with the scoped replacement.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.node-pre-gyp.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.node-pre-gyp.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.node-pre-gyp.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.node-pre-gyp.deprecated.html",
  "headline": "node-pre-gyp is deprecated — dates, impact, migration",
  "description": "npm states that the unscoped node-pre-gyp package is deprecated and only @mapbox/node-pre-gyp will receive updates.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "deprecated",
    "npm",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "node-pre-gyp is deprecated",
    "identifier": "pkg:npm/node-pre-gyp"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "node-pre-gyp package deprecation notice",
      "url": "https://www.npmjs.com/package/node-pre-gyp"
    },
    {
      "@type": "CreativeWork",
      "name": "node-pre-gyp version metadata",
      "url": "https://registry.npmjs.org/node-pre-gyp"
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
