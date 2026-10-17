---
title: "nomnom is deprecated"
description: "npm states that nomnom is no longer supported."
---

# nomnom is deprecated

npm states that nomnom is no longer supported.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/nomnom` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.nomnom.deprecated` |

## Sources

- [nomnom package deprecation notice](https://www.npmjs.com/package/nomnom)
- [nomnom registry metadata](https://registry.npmjs.org/nomnom/latest)

## Migration

**Constraints**

- Preserve command names, option aliases, defaults, validation, help output, exit codes, and parsed argument shapes.

**Steps**

1. **Select a maintained CLI parser.** Choose a maintained parser that supports the commands and option semantics used by the project.
2. **Replace nomnom.** Translate command and option declarations to the selected parser, update imports, and remove nomnom.

**Verification**

- `npm run test --if-present`: Run CLI parsing, help, error-path, and repository tests.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.nomnom.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.nomnom.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.nomnom.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.nomnom.deprecated.html",
  "headline": "nomnom is deprecated",
  "description": "npm states that nomnom is no longer supported.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "deprecated",
    "npm",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "nomnom is deprecated",
    "identifier": "pkg:npm/nomnom"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "nomnom package deprecation notice",
      "url": "https://www.npmjs.com/package/nomnom"
    },
    {
      "@type": "CreativeWork",
      "name": "nomnom registry metadata",
      "url": "https://registry.npmjs.org/nomnom/latest"
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
