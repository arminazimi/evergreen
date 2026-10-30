---
title: "figgy-pudding is no longer supported — dates, impact, migration"
description: "npm states that the figgy-pudding module is no longer supported."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.figgy-pudding.eol.html"
---

# figgy-pudding is no longer supported

**End of life.** The source gives no day. Source: [figgy-pudding package deprecation notice](https://www.npmjs.com/package/figgy-pudding).

Check a version:

```bash
evergreen check pkg:npm/figgy-pudding
```

npm states that the figgy-pudding module is no longer supported.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `npm` |
| Component | `pkg:npm/figgy-pudding` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.figgy-pudding.eol` |

## Sources

- [figgy-pudding package deprecation notice](https://www.npmjs.com/package/figgy-pudding)
- [figgy-pudding registry metadata](https://registry.npmjs.org/figgy-pudding/latest)

## Migration

**Constraints**

- Preserve option defaults, validation, inheritance, provider lookup, key enumeration, and sensitive-value handling.

**Steps**

1. **Replace configuration wrappers.** Replace figgy-pudding instances with explicit validated configuration objects or a maintained configuration library, then remove the package.

**Verification**

- `npm run test --if-present`: Run configuration defaults, validation, inheritance, and repository tests.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.figgy-pudding.eol`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.figgy-pudding.eol.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.figgy-pudding.eol.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.figgy-pudding.eol.html",
  "headline": "figgy-pudding is no longer supported — dates, impact, migration",
  "description": "npm states that the figgy-pudding module is no longer supported.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "end-of-life",
    "npm",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "figgy-pudding is no longer supported",
    "identifier": "pkg:npm/figgy-pudding"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "figgy-pudding package deprecation notice",
      "url": "https://www.npmjs.com/package/figgy-pudding"
    },
    {
      "@type": "CreativeWork",
      "name": "figgy-pudding registry metadata",
      "url": "https://registry.npmjs.org/figgy-pudding/latest"
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
