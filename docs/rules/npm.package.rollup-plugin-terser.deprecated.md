---
title: "rollup-plugin-terser is deprecated — dates, impact, migration"
description: "npm marks rollup-plugin-terser as deprecated: \"This package has been deprecated and is no longer maintained. Please use @rollup/plugin-terser\""
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.rollup-plugin-terser.deprecated.html"
json_twin: "/rules/npm.package.rollup-plugin-terser.deprecated.json"
---

# rollup-plugin-terser is deprecated

**Deprecated.** The source gives no day. Replacement: @rollup/plugin-terser. Source: [rollup-plugin-terser on npm](https://www.npmjs.com/package/rollup-plugin-terser).

Check a version:

```bash
evergreen check pkg:npm/rollup-plugin-terser
```

npm marks rollup-plugin-terser as deprecated: "This package has been deprecated and is no longer maintained. Please use @rollup/plugin-terser"

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/rollup-plugin-terser` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | @rollup/plugin-terser |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-19 (365 days after the last review) |
| Rule ID | `npm.package.rollup-plugin-terser.deprecated` |

## Sources

- [rollup-plugin-terser on npm](https://www.npmjs.com/package/rollup-plugin-terser)
- [rollup-plugin-terser registry metadata](https://registry.npmjs.org/rollup-plugin-terser/latest)

## Migration

**Constraints**

- Preserve minification options, source maps, and the assets each Rollup build emits.

**Steps**

1. **Replace the Rollup Terser plugin.** Replace rollup-plugin-terser with @rollup/plugin-terser in dependencies and the Rollup configuration, and keep the current terser options.
2. **Verify bundle output.** Compare size, source maps, and runtime behavior of every minified output with the previous build.

**Verification**

- `npm run build --if-present`: Build every Rollup output with the maintained Terser plugin.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.rollup-plugin-terser.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.rollup-plugin-terser.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.rollup-plugin-terser.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.rollup-plugin-terser.deprecated.html",
  "headline": "rollup-plugin-terser is deprecated — dates, impact, migration",
  "description": "npm marks rollup-plugin-terser as deprecated: \"This package has been deprecated and is no longer maintained. Please use @rollup/plugin-terser\"",
  "inLanguage": "en",
  "dateModified": "2026-10-19",
  "keywords": [
    "deprecated",
    "npm",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "rollup-plugin-terser is deprecated",
    "identifier": "pkg:npm/rollup-plugin-terser"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "rollup-plugin-terser on npm",
      "url": "https://www.npmjs.com/package/rollup-plugin-terser"
    },
    {
      "@type": "CreativeWork",
      "name": "rollup-plugin-terser registry metadata",
      "url": "https://registry.npmjs.org/rollup-plugin-terser/latest"
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
