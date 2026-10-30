---
title: "@types/react-virtualized-auto-sizer is deprecated — dates, impact, migration"
description: "npm marks @types/react-virtualized-auto-sizer as deprecated: \"This is a stub types definition. react-virtualized-auto-sizer provides its own type definitions, so you do not need this installed.\""
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.types.react-virtualized-auto-sizer.deprecated.html"
image: "/assets/og/npm.package.types.react-virtualized-auto-sizer.deprecated.svg"
json_twin: "/rules/npm.package.types.react-virtualized-auto-sizer.deprecated.json"
---

# @types/react-virtualized-auto-sizer is deprecated

**Deprecated.** The source gives no day. Replacement: react-virtualized-auto-sizer. Source: [@types/react-virtualized-auto-sizer on npm](https://www.npmjs.com/package/@types/react-virtualized-auto-sizer).

Check a version:

```bash
evergreen check pkg:npm/%40types/react-virtualized-auto-sizer
```

npm marks @types/react-virtualized-auto-sizer as deprecated: "This is a stub types definition. react-virtualized-auto-sizer provides its own type definitions, so you do not need this installed."

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | low |
| Ecosystem | `npm` |
| Component | `pkg:npm/%40types/react-virtualized-auto-sizer` |
| Affected versions | `vers:npm/1.0.8` |
| Date from the source | The source gives no day |
| Replacement | react-virtualized-auto-sizer |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-19 (365 days after the last review) |
| Rule ID | `npm.package.types.react-virtualized-auto-sizer.deprecated` |

## Sources

- [@types/react-virtualized-auto-sizer on npm](https://www.npmjs.com/package/@types/react-virtualized-auto-sizer)
- [@types/react-virtualized-auto-sizer version metadata](https://registry.npmjs.org/@types%2freact-virtualized-auto-sizer)

## Migration

**Constraints**

- @types/react-virtualized-auto-sizer only declares types; react-virtualized-auto-sizer now ships its own declarations, so no conflicting ambient definition may remain.

**Steps**

1. **Remove the stub types package.** Remove @types/react-virtualized-auto-sizer from devDependencies and any explicit reference to it, such as a tsconfig.json compilerOptions.types entry.
2. **Use the bundled declarations.** Keep react-virtualized-auto-sizer on a version that ships its own type definitions and import its types from react-virtualized-auto-sizer.

**Verification**

- `npm run build --if-present`: Type-check and build with react-virtualized-auto-sizer's own declarations.
- `npm run test --if-present`: Run the repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.types.react-virtualized-auto-sizer.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.types.react-virtualized-auto-sizer.deprecated.html",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.types.react-virtualized-auto-sizer.deprecated.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.types.react-virtualized-auto-sizer.deprecated.html",
      "headline": "@types/react-virtualized-auto-sizer is deprecated — dates, impact, migration",
      "description": "npm marks @types/react-virtualized-auto-sizer as deprecated: \"This is a stub types definition. react-virtualized-auto-sizer provides its own type definitions, so you do not need this installed.\"",
      "inLanguage": "en",
      "dateModified": "2026-10-19",
      "keywords": [
        "deprecated",
        "npm",
        "low"
      ],
      "about": {
        "@type": "Thing",
        "name": "@types/react-virtualized-auto-sizer is deprecated",
        "identifier": "pkg:npm/%40types/react-virtualized-auto-sizer"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "@types/react-virtualized-auto-sizer on npm",
          "url": "https://www.npmjs.com/package/@types/react-virtualized-auto-sizer"
        },
        {
          "@type": "CreativeWork",
          "name": "@types/react-virtualized-auto-sizer version metadata",
          "url": "https://registry.npmjs.org/@types%2freact-virtualized-auto-sizer"
        }
      ],
      "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/npm.json",
      "publisher": {
        "@type": "Organization",
        "name": "Evergreen",
        "url": "https://arminazimi.github.io/evergreen"
      }
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.types.react-virtualized-auto-sizer.deprecated.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.types.react-virtualized-auto-sizer.deprecated.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:npm/%40types/react-virtualized-auto-sizer?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated. The source gives no day. Affected versions: vers:npm/1.0.8. Source: @types/react-virtualized-auto-sizer on npm (https://www.npmjs.com/package/@types/react-virtualized-auto-sizer)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:npm/%40types/react-virtualized-auto-sizer?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "react-virtualized-auto-sizer"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:npm/%40types/react-virtualized-auto-sizer?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:npm/%40types/react-virtualized-auto-sizer."
          }
        }
      ]
    }
  ]
}
</script>
