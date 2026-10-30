---
title: "jade is deprecated — dates, impact, migration"
description: "npm states that Jade was renamed to Pug and directs users to the pug package."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.jade.deprecated.html"
---

# jade is deprecated

**Deprecated.** The source gives no day. Replacement: pug. Source: [jade package deprecation notice](https://www.npmjs.com/package/jade).

Check a version:

```bash
evergreen check pkg:npm/jade
```

npm states that Jade was renamed to Pug and directs users to the pug package.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/jade` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | pug |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.jade.deprecated` |

## Sources

- [jade package deprecation notice](https://www.npmjs.com/package/jade)
- [jade registry metadata](https://registry.npmjs.org/jade/latest)

## Migration

**Constraints**

- Preserve template rendering, locals, includes, inheritance, whitespace, and generated HTML.

**Steps**

1. **Replace Jade with Pug.** Replace the jade dependency, imports, file extensions, and build integrations with pug equivalents.
2. **Compare rendered output.** Render representative templates and review generated HTML and escaping behavior for differences.

**Verification**

- `npm run test --if-present`: Run template rendering and repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.jade.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.jade.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.jade.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.jade.deprecated.html",
  "headline": "jade is deprecated — dates, impact, migration",
  "description": "npm states that Jade was renamed to Pug and directs users to the pug package.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "deprecated",
    "npm",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "jade is deprecated",
    "identifier": "pkg:npm/jade"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "jade package deprecation notice",
      "url": "https://www.npmjs.com/package/jade"
    },
    {
      "@type": "CreativeWork",
      "name": "jade registry metadata",
      "url": "https://registry.npmjs.org/jade/latest"
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
