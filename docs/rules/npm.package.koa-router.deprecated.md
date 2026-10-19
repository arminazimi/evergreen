---
title: "koa-router is deprecated — dates, impact, migration"
description: "npm marks koa-router as deprecated: \"Please use @koa/router instead, starting from v9!\""
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.koa-router.deprecated.html"
---

# koa-router is deprecated

npm marks koa-router as deprecated: "Please use @koa/router instead, starting from v9!"

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/koa-router` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | @koa/router |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-19 (365 days after the last review) |
| Rule ID | `npm.package.koa-router.deprecated` |

## Sources

- [koa-router on npm](https://www.npmjs.com/package/koa-router)
- [koa-router registry metadata](https://registry.npmjs.org/koa-router/latest)

## Migration

**Constraints**

- Preserve route paths, parameter names, middleware order, allowed methods, and error handling.

**Steps**

1. **Replace koa-router.** Move the dependency and imports from koa-router to @koa/router and keep the current constructor and middleware usage.
2. **Verify routing behavior.** Exercise every route, parameter pattern, and allowed method to confirm dispatch and error handling are unchanged.

**Verification**

- `npm run test --if-present`: Run the routing and repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.koa-router.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.koa-router.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.koa-router.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.koa-router.deprecated.html",
  "headline": "koa-router is deprecated — dates, impact, migration",
  "description": "npm marks koa-router as deprecated: \"Please use @koa/router instead, starting from v9!\"",
  "inLanguage": "en",
  "dateModified": "2026-10-19",
  "keywords": [
    "deprecated",
    "npm",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "koa-router is deprecated",
    "identifier": "pkg:npm/koa-router"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "koa-router on npm",
      "url": "https://www.npmjs.com/package/koa-router"
    },
    {
      "@type": "CreativeWork",
      "name": "koa-router registry metadata",
      "url": "https://registry.npmjs.org/koa-router/latest"
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
