---
title: "rollup-plugin-babel is deprecated — dates, impact, migration"
description: "npm states that rollup-plugin-babel is deprecated and no longer maintained, and recommends @rollup/plugin-babel."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.rollup-plugin-babel.deprecated.html"
json_twin: "/rules/npm.package.rollup-plugin-babel.deprecated.json"
---

# rollup-plugin-babel is deprecated

**Deprecated.** The source gives no day. Replacement: @rollup/plugin-babel. Source: [rollup-plugin-babel package deprecation notice](https://www.npmjs.com/package/rollup-plugin-babel).

Check a version:

```bash
evergreen check pkg:npm/rollup-plugin-babel
```

npm states that rollup-plugin-babel is deprecated and no longer maintained, and recommends @rollup/plugin-babel.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/rollup-plugin-babel` |
| Affected versions | `vers:npm/1.0.0\|2.0.0\|2.0.1\|2.1.0\|2.2.0\|2.3.0\|2.3.1\|2.3.2\|2.3.3\|2.3.4\|2.3.5\|2.3.6\|2.3.7\|2.3.8\|2.3.9\|2.4.0\|2.5.0\|2.5.1\|2.6.0\|2.6.1\|2.7.0\|2.7.1\|3.0.0\|3.0.1\|3.0.2\|3.0.3\|3.0.4\|3.0.5\|3.0.6\|3.0.7\|4.0.0\|4.0.1\|4.0.2\|4.0.3\|4.1.0\|4.2.0\|4.3.0\|4.3.1\|4.3.2\|4.3.3\|4.4.0` |
| Date from the source | The source gives no day |
| Replacement | @rollup/plugin-babel |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.rollup-plugin-babel.deprecated` |

## Sources

- [rollup-plugin-babel package deprecation notice](https://www.npmjs.com/package/rollup-plugin-babel)
- [rollup-plugin-babel version metadata](https://registry.npmjs.org/rollup-plugin-babel)

## Migration

**Constraints**

- Preserve Babel presets and plugins, file inclusion, helper strategy, output targets, source maps, and Rollup output behavior.

**Steps**

1. **Replace the Rollup Babel plugin.** Replace rollup-plugin-babel with @rollup/plugin-babel and update Rollup imports and plugin options.
2. **Verify bundle output.** Compare emitted syntax, helpers, source maps, and bundle behavior for every configured output.

**Verification**

- `npm run build --if-present`: Build every Rollup output with the maintained Babel plugin.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.rollup-plugin-babel.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.rollup-plugin-babel.deprecated.html",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.rollup-plugin-babel.deprecated.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.rollup-plugin-babel.deprecated.html",
      "headline": "rollup-plugin-babel is deprecated — dates, impact, migration",
      "description": "npm states that rollup-plugin-babel is deprecated and no longer maintained, and recommends @rollup/plugin-babel.",
      "inLanguage": "en",
      "dateModified": "2026-10-16",
      "keywords": [
        "deprecated",
        "npm",
        "medium"
      ],
      "about": {
        "@type": "Thing",
        "name": "rollup-plugin-babel is deprecated",
        "identifier": "pkg:npm/rollup-plugin-babel"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "rollup-plugin-babel package deprecation notice",
          "url": "https://www.npmjs.com/package/rollup-plugin-babel"
        },
        {
          "@type": "CreativeWork",
          "name": "rollup-plugin-babel version metadata",
          "url": "https://registry.npmjs.org/rollup-plugin-babel"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.rollup-plugin-babel.deprecated.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.rollup-plugin-babel.deprecated.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:npm/rollup-plugin-babel?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated. The source gives no day. Affected versions: vers:npm/1.0.0|2.0.0|2.0.1|2.1.0|2.2.0|2.3.0|2.3.1|2.3.2|2.3.3|2.3.4|2.3.5|2.3.6|2.3.7|2.3.8|2.3.9|2.4.0|2.5.0|2.5.1|2.6.0|2.6.1|2.7.0|2.7.1|3.0.0|3.0.1|3.0.2|3.0.3|3.0.4|3.0.5|3.0.6|3.0.7|4.0.0|4.0.1|4.0.2|4.0.3|4.1.0|4.2.0|4.3.0|4.3.1|4.3.2|4.3.3|4.4.0. Source: rollup-plugin-babel package deprecation notice (https://www.npmjs.com/package/rollup-plugin-babel)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:npm/rollup-plugin-babel?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "@rollup/plugin-babel"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:npm/rollup-plugin-babel?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:npm/rollup-plugin-babel."
          }
        }
      ]
    }
  ]
}
</script>
