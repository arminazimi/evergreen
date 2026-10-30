---
title: "eslint-plugin-nuxt is deprecated — dates, impact, migration"
description: "npm marks eslint-plugin-nuxt as deprecated: \"eslint-plugin-nuxt was built for Nuxt 2. Use @nuxt/eslint-plugin instead: https://eslint.nuxt.com/packages/plugin\""
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.eslint-plugin-nuxt.deprecated.html"
json_twin: "/rules/npm.package.eslint-plugin-nuxt.deprecated.json"
---

# eslint-plugin-nuxt is deprecated

**Deprecated.** The source gives no day. Replacement: @nuxt/eslint-plugin. Source: [eslint-plugin-nuxt on npm](https://www.npmjs.com/package/eslint-plugin-nuxt).

Check a version:

```bash
evergreen check pkg:npm/eslint-plugin-nuxt
```

npm marks eslint-plugin-nuxt as deprecated: "eslint-plugin-nuxt was built for Nuxt 2. Use @nuxt/eslint-plugin instead: https://eslint.nuxt.com/packages/plugin"

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/eslint-plugin-nuxt` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | @nuxt/eslint-plugin |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-19 (365 days after the last review) |
| Rule ID | `npm.package.eslint-plugin-nuxt.deprecated` |

## Sources

- [eslint-plugin-nuxt on npm](https://www.npmjs.com/package/eslint-plugin-nuxt)
- [eslint-plugin-nuxt registry metadata](https://registry.npmjs.org/eslint-plugin-nuxt/latest)

## Migration

**Constraints**

- Keep the Nuxt-specific lint rules and options the project currently enables.

**Steps**

1. **Replace the plugin package.** Replace eslint-plugin-nuxt with @nuxt/eslint-plugin in devDependencies and in the ESLint configuration.
2. **Port the enabled rules.** Move the enabled Nuxt rules and their options into the configuration shape the new plugin expects.

**Verification**

- `npm run lint --if-present`: Run the linter with the new plugin and compare the findings.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.eslint-plugin-nuxt.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.eslint-plugin-nuxt.deprecated.html",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.eslint-plugin-nuxt.deprecated.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.eslint-plugin-nuxt.deprecated.html",
      "headline": "eslint-plugin-nuxt is deprecated — dates, impact, migration",
      "description": "npm marks eslint-plugin-nuxt as deprecated: \"eslint-plugin-nuxt was built for Nuxt 2. Use @nuxt/eslint-plugin instead: https://eslint.nuxt.com/packages/plugin\"",
      "inLanguage": "en",
      "dateModified": "2026-10-19",
      "keywords": [
        "deprecated",
        "npm",
        "medium"
      ],
      "about": {
        "@type": "Thing",
        "name": "eslint-plugin-nuxt is deprecated",
        "identifier": "pkg:npm/eslint-plugin-nuxt"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "eslint-plugin-nuxt on npm",
          "url": "https://www.npmjs.com/package/eslint-plugin-nuxt"
        },
        {
          "@type": "CreativeWork",
          "name": "eslint-plugin-nuxt registry metadata",
          "url": "https://registry.npmjs.org/eslint-plugin-nuxt/latest"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.eslint-plugin-nuxt.deprecated.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.eslint-plugin-nuxt.deprecated.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:npm/eslint-plugin-nuxt?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated. The source gives no day. Affected versions: vers:npm/*. Source: eslint-plugin-nuxt on npm (https://www.npmjs.com/package/eslint-plugin-nuxt)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:npm/eslint-plugin-nuxt?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "@nuxt/eslint-plugin"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:npm/eslint-plugin-nuxt?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:npm/eslint-plugin-nuxt."
          }
        }
      ]
    }
  ]
}
</script>
