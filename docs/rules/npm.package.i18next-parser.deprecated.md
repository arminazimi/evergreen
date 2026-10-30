---
title: "i18next-parser is deprecated — dates, impact, migration"
description: "npm marks i18next-parser as deprecated: \"Project is deprecated, use i18next-cli instead\""
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.i18next-parser.deprecated.html"
json_twin: "/rules/npm.package.i18next-parser.deprecated.json"
---

# i18next-parser is deprecated

npm marks i18next-parser as deprecated: "Project is deprecated, use i18next-cli instead"

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/i18next-parser` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | i18next-cli |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-19 (365 days after the last review) |
| Rule ID | `npm.package.i18next-parser.deprecated` |

## Sources

- [i18next-parser on npm](https://www.npmjs.com/package/i18next-parser)
- [i18next-parser registry metadata](https://registry.npmjs.org/i18next-parser/latest)

## Migration

**Constraints**

- Preserve the extracted keys, namespaces, default values, plural forms, and catalog layout the project already uses.

**Steps**

1. **Replace the extraction tool.** Replace i18next-parser with i18next-cli in devDependencies and update the extraction script that runs it.
2. **Compare the extracted catalogs.** Run the new extractor and review the diff against the existing catalogs, keeping keys, ordering, and metadata stable.

**Verification**

- `npm run build --if-present`: Build the translations with the new extractor.
- `npm run test --if-present`: Run the repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.i18next-parser.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.i18next-parser.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.i18next-parser.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.i18next-parser.deprecated.html",
  "headline": "i18next-parser is deprecated — dates, impact, migration",
  "description": "npm marks i18next-parser as deprecated: \"Project is deprecated, use i18next-cli instead\"",
  "inLanguage": "en",
  "dateModified": "2026-10-19",
  "keywords": [
    "deprecated",
    "npm",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "i18next-parser is deprecated",
    "identifier": "pkg:npm/i18next-parser"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "i18next-parser on npm",
      "url": "https://www.npmjs.com/package/i18next-parser"
    },
    {
      "@type": "CreativeWork",
      "name": "i18next-parser registry metadata",
      "url": "https://registry.npmjs.org/i18next-parser/latest"
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
