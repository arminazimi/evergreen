---
title: "Repl.builtinModules is deprecated — dates, impact, migration"
description: "Node.js deprecates repl.builtinModules (DEP0191: documentation-only since v24.0.0)."
canonical_url: "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.repl.builtinmodules.html"
json_twin: "/rules/nodejs.symbol.repl.builtinmodules.json"
---

# Repl.builtinModules is deprecated

**Deprecated.** The source gives no day. Replacement: require('node:module').builtinModules. Source: [Node.js deprecations: DEP0191](https://nodejs.org/api/deprecations.html).

Check a version:

```bash
evergreen check pkg:generic/nodejs
```

Node.js deprecates repl.builtinModules (DEP0191: documentation-only since v24.0.0).

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | low |
| Ecosystem | `nodejs` |
| Component | `pkg:generic/nodejs` |
| Affected versions | `vers:semver/>=24.0.0` |
| Date from the source | The source gives no day |
| Replacement | require('node:module').builtinModules |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-10-21 (365 days after the last review) |
| Rule ID | `nodejs.symbol.repl.builtinmodules` |

## Sources

- [Node.js deprecations: DEP0191](https://nodejs.org/api/deprecations.html)

## Migration

**Constraints**

- Keep the behavior of the code unchanged; check the replacement's argument and return-value differences.

**Steps**

1. **Replace the usage.** Replace each reported use of repl.builtinModules with require('node:module').builtinModules.

**Verification**

- `npm run test --if-present`: Run the repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/nodejs.json`](https://github.com/arminazimi/evergreen/blob/main/registry/nodejs.json), rule `nodejs.symbol.repl.builtinmodules`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.repl.builtinmodules.html",
      "url": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.repl.builtinmodules.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.repl.builtinmodules.html",
      "headline": "Repl.builtinModules is deprecated — dates, impact, migration",
      "description": "Node.js deprecates repl.builtinModules (DEP0191: documentation-only since v24.0.0).",
      "inLanguage": "en",
      "dateModified": "2026-10-21",
      "keywords": [
        "deprecated",
        "nodejs",
        "low"
      ],
      "about": {
        "@type": "Thing",
        "name": "Repl.builtinModules is deprecated",
        "identifier": "pkg:generic/nodejs"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Node.js deprecations: DEP0191",
          "url": "https://nodejs.org/api/deprecations.html"
        }
      ],
      "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/nodejs.json",
      "publisher": {
        "@type": "Organization",
        "name": "Evergreen",
        "url": "https://arminazimi.github.io/evergreen"
      }
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.repl.builtinmodules.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.repl.builtinmodules.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/nodejs?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated. The source gives no day. Affected versions: vers:semver/>=24.0.0. Source: Node.js deprecations: DEP0191 (https://nodejs.org/api/deprecations.html)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/nodejs?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "require('node:module').builtinModules"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/nodejs?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/nodejs."
          }
        }
      ]
    }
  ]
}
</script>
