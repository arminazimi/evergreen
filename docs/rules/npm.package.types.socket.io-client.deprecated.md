---
title: "@types/socket.io-client is deprecated — dates, impact, migration"
description: "npm marks @types/socket.io-client as deprecated: \"This is a stub types definition. socket.io-client provides its own type definitions, so you do not need this installed.\""
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.types.socket.io-client.deprecated.html"
---

# @types/socket.io-client is deprecated

npm marks @types/socket.io-client as deprecated: "This is a stub types definition. socket.io-client provides its own type definitions, so you do not need this installed."

| | |
| --- | --- |
| Status | Deprecated |
| Severity | low |
| Ecosystem | `npm` |
| Component | `pkg:npm/%40types/socket.io-client` |
| Affected versions | `vers:npm/3.0.0` |
| Date from the source | The source gives no day |
| Replacement | socket.io-client |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-19 (365 days after the last review) |
| Rule ID | `npm.package.types.socket.io-client.deprecated` |

## Sources

- [@types/socket.io-client on npm](https://www.npmjs.com/package/@types/socket.io-client)
- [@types/socket.io-client version metadata](https://registry.npmjs.org/@types%2fsocket.io-client)

## Migration

**Constraints**

- @types/socket.io-client only declares types; socket.io-client now ships its own declarations, so no conflicting ambient definition may remain.

**Steps**

1. **Remove the stub types package.** Remove @types/socket.io-client from devDependencies and any explicit reference to it, such as a tsconfig.json compilerOptions.types entry.
2. **Use the bundled declarations.** Keep socket.io-client on a version that ships its own type definitions and import its types from socket.io-client.

**Verification**

- `npm run build --if-present`: Type-check and build with socket.io-client's own declarations.
- `npm run test --if-present`: Run the repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.types.socket.io-client.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.types.socket.io-client.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.types.socket.io-client.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.types.socket.io-client.deprecated.html",
  "headline": "@types/socket.io-client is deprecated — dates, impact, migration",
  "description": "npm marks @types/socket.io-client as deprecated: \"This is a stub types definition. socket.io-client provides its own type definitions, so you do not need this installed.\"",
  "inLanguage": "en",
  "dateModified": "2026-10-19",
  "keywords": [
    "deprecated",
    "npm",
    "low"
  ],
  "about": {
    "@type": "Thing",
    "name": "@types/socket.io-client is deprecated",
    "identifier": "pkg:npm/%40types/socket.io-client"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "@types/socket.io-client on npm",
      "url": "https://www.npmjs.com/package/@types/socket.io-client"
    },
    {
      "@type": "CreativeWork",
      "name": "@types/socket.io-client version metadata",
      "url": "https://registry.npmjs.org/@types%2fsocket.io-client"
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
