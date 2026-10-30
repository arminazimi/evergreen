---
title: "@types/refractor is deprecated — dates, impact, migration"
description: "npm marks @types/refractor as deprecated: \"This is a stub types definition. refractor provides its own type definitions, so you do not need this installed.\""
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.types.refractor.deprecated.html"
json_twin: "/rules/npm.package.types.refractor.deprecated.json"
---

# @types/refractor is deprecated

**Deprecated.** The source gives no day. Replacement: refractor. Source: [@types/refractor on npm](https://www.npmjs.com/package/@types/refractor).

Check a version:

```bash
evergreen check pkg:npm/%40types/refractor
```

npm marks @types/refractor as deprecated: "This is a stub types definition. refractor provides its own type definitions, so you do not need this installed."

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | low |
| Ecosystem | `npm` |
| Component | `pkg:npm/%40types/refractor` |
| Affected versions | `vers:npm/4.0.0` |
| Date from the source | The source gives no day |
| Replacement | refractor |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-19 (365 days after the last review) |
| Rule ID | `npm.package.types.refractor.deprecated` |

## Sources

- [@types/refractor on npm](https://www.npmjs.com/package/@types/refractor)
- [@types/refractor version metadata](https://registry.npmjs.org/@types%2frefractor)

## Migration

**Constraints**

- @types/refractor only declares types; refractor now ships its own declarations, so no conflicting ambient definition may remain.

**Steps**

1. **Remove the stub types package.** Remove @types/refractor from devDependencies and any explicit reference to it, such as a tsconfig.json compilerOptions.types entry.
2. **Use the bundled declarations.** Keep refractor on a version that ships its own type definitions and import its types from refractor.

**Verification**

- `npm run build --if-present`: Type-check and build with refractor's own declarations.
- `npm run test --if-present`: Run the repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Same ecosystem

- [abab is deprecated](npm.package.abab.deprecated.html)
- [@angular/core v18 and older are no longer supported](npm.package.angular.core.v18-and-older.end-of-support.html)
- [@angular/core v19 is no longer supported](npm.package.angular.core.v19.end-of-support.html)
- [@angular/core v20 reaches end of life on 2026-11-28](npm.package.angular.core.v20.scheduled-end-of-life.html)
- [@angular/core v21 reaches end of life on 2027-06-30](npm.package.angular.core.v21.scheduled-end-of-life.html)
- [@angular/core v22 reaches end of life on 2028-06-30](npm.package.angular.core.v22.scheduled-end-of-life.html)
- [are-we-there-yet is no longer supported](npm.package.are-we-there-yet.eol.html)
- [babel-eslint is deprecated](npm.package.babel-eslint.deprecated.html)


## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.types.refractor.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.types.refractor.deprecated.html",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.types.refractor.deprecated.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.types.refractor.deprecated.html",
      "headline": "@types/refractor is deprecated — dates, impact, migration",
      "description": "npm marks @types/refractor as deprecated: \"This is a stub types definition. refractor provides its own type definitions, so you do not need this installed.\"",
      "inLanguage": "en",
      "dateModified": "2026-10-19",
      "keywords": [
        "deprecated",
        "npm",
        "low"
      ],
      "about": {
        "@type": "Thing",
        "name": "@types/refractor is deprecated",
        "identifier": "pkg:npm/%40types/refractor"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "@types/refractor on npm",
          "url": "https://www.npmjs.com/package/@types/refractor"
        },
        {
          "@type": "CreativeWork",
          "name": "@types/refractor version metadata",
          "url": "https://registry.npmjs.org/@types%2frefractor"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.types.refractor.deprecated.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.types.refractor.deprecated.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:npm/%40types/refractor?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated. The source gives no day. Affected versions: vers:npm/4.0.0. Source: @types/refractor on npm (https://www.npmjs.com/package/@types/refractor)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:npm/%40types/refractor?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "refractor"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:npm/%40types/refractor?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:npm/%40types/refractor."
          }
        }
      ]
    }
  ]
}
</script>
