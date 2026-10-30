---
title: "Node Sass is end-of-life — dates, impact, migration"
description: "Node Sass is no longer maintained and its repository has been archived."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.node-sass.eol.html"
---

# Node Sass is end-of-life

**End of life** as of 2024-07-24. Replacement: sass. Source: [Node Sass is end-of-life](https://sass-lang.com/blog/node-sass-is-end-of-life/).

Check a version:

```bash
evergreen check pkg:npm/node-sass
```

Node Sass is no longer maintained and its repository has been archived.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `npm` |
| Component | `pkg:npm/node-sass` |
| Affected versions | `vers:npm/*` |
| Date from the source | 2024-07-24 |
| Replacement | sass |
| Evidence last seen | 2026-10-13 |
| Reviewed | 2026-10-14 by arminazimi |
| Review due | 2027-10-14 (365 days after the last review) |
| Rule ID | `npm.package.node-sass.eol` |

## Sources

- [Node Sass is end-of-life](https://sass-lang.com/blog/node-sass-is-end-of-life/)

## Migration

**Constraints**

- Preserve Sass include paths, importer behavior, output style, source maps, and generated CSS expected by the build.

**Steps**

1. **Replace Node Sass.** Remove node-sass and add the maintained sass package in the same dependency section.
2. **Update compiler usages.** Migrate render and renderSync imports and options to the supported Sass interface used by the project.
3. **Compare compiled output.** Review generated CSS and source maps for behaviorally relevant differences.

**Verification**

- `npm run test --if-present`: Run stylesheet and repository tests when defined.
- `npm run build --if-present`: Compile the project and its stylesheets with Sass.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.node-sass.eol`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.node-sass.eol.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.node-sass.eol.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.node-sass.eol.html",
  "headline": "Node Sass is end-of-life — dates, impact, migration",
  "description": "Node Sass is no longer maintained and its repository has been archived.",
  "inLanguage": "en",
  "dateModified": "2026-10-14",
  "keywords": [
    "end-of-life",
    "npm",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Node Sass is end-of-life",
    "identifier": "pkg:npm/node-sass"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Node Sass is end-of-life",
      "url": "https://sass-lang.com/blog/node-sass-is-end-of-life/"
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
