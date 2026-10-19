---
title: "@types/sanitize-filename is deprecated — dates, impact, migration"
description: "npm marks @types/sanitize-filename as deprecated: \"This is a stub types definition. sanitize-filename provides its own type definitions, so you do not need this installed.\""
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.types.sanitize-filename.deprecated.html"
---

# @types/sanitize-filename is deprecated

npm marks @types/sanitize-filename as deprecated: "This is a stub types definition. sanitize-filename provides its own type definitions, so you do not need this installed."

| | |
| --- | --- |
| Status | Deprecated |
| Severity | low |
| Ecosystem | `npm` |
| Component | `pkg:npm/%40types/sanitize-filename` |
| Affected versions | `vers:npm/1.6.3` |
| Date from the source | The source gives no day |
| Replacement | sanitize-filename |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-19 (365 days after the last review) |
| Rule ID | `npm.package.types.sanitize-filename.deprecated` |

## Sources

- [@types/sanitize-filename on npm](https://www.npmjs.com/package/@types/sanitize-filename)
- [@types/sanitize-filename version metadata](https://registry.npmjs.org/@types%2fsanitize-filename)

## Migration

**Constraints**

- @types/sanitize-filename only declares types; sanitize-filename now ships its own declarations, so no conflicting ambient definition may remain.

**Steps**

1. **Remove the stub types package.** Remove @types/sanitize-filename from devDependencies and any explicit reference to it, such as a tsconfig.json compilerOptions.types entry.
2. **Use the bundled declarations.** Keep sanitize-filename on a version that ships its own type definitions and import its types from sanitize-filename.

**Verification**

- `npm run build --if-present`: Type-check and build with sanitize-filename's own declarations.
- `npm run test --if-present`: Run the repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.types.sanitize-filename.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.types.sanitize-filename.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.types.sanitize-filename.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.types.sanitize-filename.deprecated.html",
  "headline": "@types/sanitize-filename is deprecated — dates, impact, migration",
  "description": "npm marks @types/sanitize-filename as deprecated: \"This is a stub types definition. sanitize-filename provides its own type definitions, so you do not need this installed.\"",
  "inLanguage": "en",
  "dateModified": "2026-10-19",
  "keywords": [
    "deprecated",
    "npm",
    "low"
  ],
  "about": {
    "@type": "Thing",
    "name": "@types/sanitize-filename is deprecated",
    "identifier": "pkg:npm/%40types/sanitize-filename"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "@types/sanitize-filename on npm",
      "url": "https://www.npmjs.com/package/@types/sanitize-filename"
    },
    {
      "@type": "CreativeWork",
      "name": "@types/sanitize-filename version metadata",
      "url": "https://registry.npmjs.org/@types%2fsanitize-filename"
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
