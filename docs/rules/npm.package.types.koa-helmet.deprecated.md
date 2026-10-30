---
title: "@types/koa-helmet is deprecated — dates, impact, migration"
description: "npm marks @types/koa-helmet as deprecated: \"This is a stub types definition. koa-helmet provides its own type definitions, so you do not need this installed.\""
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.types.koa-helmet.deprecated.html"
json_twin: "/rules/npm.package.types.koa-helmet.deprecated.json"
---

# @types/koa-helmet is deprecated

**Deprecated.** The source gives no day. Replacement: koa-helmet. Source: [@types/koa-helmet on npm](https://www.npmjs.com/package/@types/koa-helmet).

Check a version:

```bash
evergreen check pkg:npm/%40types/koa-helmet
```

npm marks @types/koa-helmet as deprecated: "This is a stub types definition. koa-helmet provides its own type definitions, so you do not need this installed."

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | low |
| Ecosystem | `npm` |
| Component | `pkg:npm/%40types/koa-helmet` |
| Affected versions | `vers:npm/6.1.0` |
| Date from the source | The source gives no day |
| Replacement | koa-helmet |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-19 (365 days after the last review) |
| Rule ID | `npm.package.types.koa-helmet.deprecated` |

## Sources

- [@types/koa-helmet on npm](https://www.npmjs.com/package/@types/koa-helmet)
- [@types/koa-helmet version metadata](https://registry.npmjs.org/@types%2fkoa-helmet)

## Migration

**Constraints**

- @types/koa-helmet only declares types; koa-helmet now ships its own declarations, so no conflicting ambient definition may remain.

**Steps**

1. **Remove the stub types package.** Remove @types/koa-helmet from devDependencies and any explicit reference to it, such as a tsconfig.json compilerOptions.types entry.
2. **Use the bundled declarations.** Keep koa-helmet on a version that ships its own type definitions and import its types from koa-helmet.

**Verification**

- `npm run build --if-present`: Type-check and build with koa-helmet's own declarations.
- `npm run test --if-present`: Run the repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.types.koa-helmet.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.types.koa-helmet.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.types.koa-helmet.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.types.koa-helmet.deprecated.html",
  "headline": "@types/koa-helmet is deprecated — dates, impact, migration",
  "description": "npm marks @types/koa-helmet as deprecated: \"This is a stub types definition. koa-helmet provides its own type definitions, so you do not need this installed.\"",
  "inLanguage": "en",
  "dateModified": "2026-10-19",
  "keywords": [
    "deprecated",
    "npm",
    "low"
  ],
  "about": {
    "@type": "Thing",
    "name": "@types/koa-helmet is deprecated",
    "identifier": "pkg:npm/%40types/koa-helmet"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "@types/koa-helmet on npm",
      "url": "https://www.npmjs.com/package/@types/koa-helmet"
    },
    {
      "@type": "CreativeWork",
      "name": "@types/koa-helmet version metadata",
      "url": "https://registry.npmjs.org/@types%2fkoa-helmet"
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
