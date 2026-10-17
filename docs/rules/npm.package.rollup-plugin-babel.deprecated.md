---
title: "rollup-plugin-babel is deprecated — dates, impact, migration"
description: "npm states that rollup-plugin-babel is deprecated and no longer maintained, and recommends @rollup/plugin-babel."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.rollup-plugin-babel.deprecated.html"
---

# rollup-plugin-babel is deprecated

npm states that rollup-plugin-babel is deprecated and no longer maintained, and recommends @rollup/plugin-babel.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/rollup-plugin-babel` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | @rollup/plugin-babel |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.rollup-plugin-babel.deprecated` |

## Sources

- [rollup-plugin-babel package deprecation notice](https://www.npmjs.com/package/rollup-plugin-babel)
- [rollup-plugin-babel registry metadata](https://registry.npmjs.org/rollup-plugin-babel/latest)

## Migration

**Constraints**

- Preserve Babel presets and plugins, file inclusion, helper strategy, output targets, source maps, and Rollup output behavior.

**Steps**

1. **Replace the Rollup Babel plugin.** Replace rollup-plugin-babel with @rollup/plugin-babel and update Rollup imports and plugin options.
2. **Verify bundle output.** Compare emitted syntax, helpers, source maps, and bundle behavior for every configured output.

**Verification**

- `npm run build --if-present`: Build every Rollup output with the maintained Babel plugin.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.rollup-plugin-babel.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.rollup-plugin-babel.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.rollup-plugin-babel.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.rollup-plugin-babel.deprecated.html",
  "headline": "rollup-plugin-babel is deprecated — dates, impact, migration",
  "description": "npm states that rollup-plugin-babel is deprecated and no longer maintained, and recommends @rollup/plugin-babel.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "deprecated",
    "npm",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "rollup-plugin-babel is deprecated",
    "identifier": "pkg:npm/rollup-plugin-babel"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "rollup-plugin-babel package deprecation notice",
      "url": "https://www.npmjs.com/package/rollup-plugin-babel"
    },
    {
      "@type": "CreativeWork",
      "name": "rollup-plugin-babel registry metadata",
      "url": "https://registry.npmjs.org/rollup-plugin-babel/latest"
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
