---
title: "@nuxt/typescript-build is deprecated — dates, impact, migration"
description: "npm marks @nuxt/typescript-build as deprecated: \"Nuxt 2 has reached EOL and is no longer actively maintained. See https://nuxt.com/blog/nuxt2-eol for more details.\""
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.nuxt.typescript-build.deprecated.html"
json_twin: "/rules/npm.package.nuxt.typescript-build.deprecated.json"
---

# @nuxt/typescript-build is deprecated

**Deprecated.** The source gives no day. Replacement: Nuxt 3 (no TypeScript build module needed). Source: [@nuxt/typescript-build on npm](https://www.npmjs.com/package/@nuxt/typescript-build).

Check a version:

```bash
evergreen check pkg:npm/%40nuxt/typescript-build
```

npm marks @nuxt/typescript-build as deprecated: "Nuxt 2 has reached EOL and is no longer actively maintained. See https://nuxt.com/blog/nuxt2-eol for more details."

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/%40nuxt/typescript-build` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | Nuxt 3 (no TypeScript build module needed) |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-19 (365 days after the last review) |
| Rule ID | `npm.package.nuxt.typescript-build.deprecated` |

## Sources

- [@nuxt/typescript-build on npm](https://www.npmjs.com/package/@nuxt/typescript-build)
- [@nuxt/typescript-build registry metadata](https://registry.npmjs.org/@nuxt%2ftypescript-build/latest)

## Migration

**Constraints**

- Preserve TypeScript compilation, type checking, and the build-module behavior the project depends on.

**Steps**

1. **Plan the Nuxt 3 upgrade.** Follow the Nuxt 3 migration guidance for build modules and TypeScript configuration before removing the module.
2. **Drop the TypeScript build module.** Remove @nuxt/typescript-build from buildModules and the project dependencies; Nuxt 3 compiles and type-checks TypeScript without a build module.

**Verification**

- `npm run build --if-present`: Build the Nuxt 3 application with its built-in TypeScript support.
- `npm run test --if-present`: Run the application and repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.nuxt.typescript-build.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.nuxt.typescript-build.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.nuxt.typescript-build.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.nuxt.typescript-build.deprecated.html",
  "headline": "@nuxt/typescript-build is deprecated — dates, impact, migration",
  "description": "npm marks @nuxt/typescript-build as deprecated: \"Nuxt 2 has reached EOL and is no longer actively maintained. See https://nuxt.com/blog/nuxt2-eol for more details.\"",
  "inLanguage": "en",
  "dateModified": "2026-10-19",
  "keywords": [
    "deprecated",
    "npm",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "@nuxt/typescript-build is deprecated",
    "identifier": "pkg:npm/%40nuxt/typescript-build"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "@nuxt/typescript-build on npm",
      "url": "https://www.npmjs.com/package/@nuxt/typescript-build"
    },
    {
      "@type": "CreativeWork",
      "name": "@nuxt/typescript-build registry metadata",
      "url": "https://registry.npmjs.org/@nuxt%2ftypescript-build/latest"
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
