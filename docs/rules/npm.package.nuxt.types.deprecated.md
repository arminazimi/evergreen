---
title: "@nuxt/types is deprecated — dates, impact, migration"
description: "npm marks @nuxt/types as deprecated: \"Nuxt 2 has reached EOL and is no longer actively maintained. See https://nuxt.com/blog/nuxt2-eol for more details.\""
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.nuxt.types.deprecated.html"
json_twin: "/rules/npm.package.nuxt.types.deprecated.json"
---

# @nuxt/types is deprecated

**Deprecated.** The source gives no day. Replacement: Nuxt 3. Source: [@nuxt/types on npm](https://www.npmjs.com/package/@nuxt/types).

Check a version:

```bash
evergreen check pkg:npm/%40nuxt/types
```

npm marks @nuxt/types as deprecated: "Nuxt 2 has reached EOL and is no longer actively maintained. See https://nuxt.com/blog/nuxt2-eol for more details."

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/%40nuxt/types` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | Nuxt 3 |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-19 (365 days after the last review) |
| Rule ID | `npm.package.nuxt.types.deprecated` |

## Sources

- [@nuxt/types on npm](https://www.npmjs.com/package/@nuxt/types)
- [@nuxt/types registry metadata](https://registry.npmjs.org/@nuxt%2ftypes/latest)

## Migration

**Constraints**

- Nuxt 2 is end of life; preserve routing, data fetching, build modules, and the TypeScript coverage the project relies on while moving to Nuxt 3.

**Steps**

1. **Plan the Nuxt 3 upgrade.** Follow the Nuxt 3 migration guidance for pages, plugins, modules, and the build configuration before removing the Nuxt 2 type packages.
2. **Remove the Nuxt 2 type package.** Remove @nuxt/types once the project runs on Nuxt 3, which ships its own types.

**Verification**

- `npm run build --if-present`: Build the application on Nuxt 3 with its bundled types.
- `npm run test --if-present`: Run the application and repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.nuxt.types.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.nuxt.types.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.nuxt.types.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.nuxt.types.deprecated.html",
  "headline": "@nuxt/types is deprecated — dates, impact, migration",
  "description": "npm marks @nuxt/types as deprecated: \"Nuxt 2 has reached EOL and is no longer actively maintained. See https://nuxt.com/blog/nuxt2-eol for more details.\"",
  "inLanguage": "en",
  "dateModified": "2026-10-19",
  "keywords": [
    "deprecated",
    "npm",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "@nuxt/types is deprecated",
    "identifier": "pkg:npm/%40nuxt/types"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "@nuxt/types on npm",
      "url": "https://www.npmjs.com/package/@nuxt/types"
    },
    {
      "@type": "CreativeWork",
      "name": "@nuxt/types registry metadata",
      "url": "https://registry.npmjs.org/@nuxt%2ftypes/latest"
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
