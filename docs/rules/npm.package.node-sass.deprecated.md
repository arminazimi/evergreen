---
title: "node-sass is deprecated — dates, impact, migration"
description: "npm marks node-sass as deprecated: \"Node Sass is no longer supported. Please use `sass` or `sass-embedded` instead.\""
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.node-sass.deprecated.html"
image: "/assets/og/npm.package.node-sass.deprecated.svg"
json_twin: "/rules/npm.package.node-sass.deprecated.json"
---

# node-sass is deprecated

**Deprecated.** The source gives no day. Replacement: sass. Source: [node-sass package deprecation notice](https://www.npmjs.com/package/node-sass).

Check a version:

```bash
evergreen check pkg:npm/node-sass
```

npm marks node-sass as deprecated: "Node Sass is no longer supported. Please use `sass` or `sass-embedded` instead."

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/node-sass` |
| Affected versions | `vers:npm/0.2.0\|0.2.1\|0.2.2\|0.2.3\|0.2.4\|0.2.5\|0.2.6\|0.3.0\|0.4.0\|0.4.1\|0.4.2\|0.4.3\|0.4.4\|0.5.0\|0.5.1\|0.5.2\|0.5.3\|0.5.4\|0.6.0\|0.6.1\|0.6.2\|0.6.3\|0.6.4\|0.6.5\|0.6.6\|0.6.7\|0.7.0-alpha\|0.7.0\|0.8.0\|0.8.1\|0.8.2\|0.8.3\|0.8.4\|0.8.5\|0.8.6\|0.9.0\|0.9.1\|0.9.2\|0.9.3\|0.9.4-rc1\|0.9.4\|0.9.5-rc1\|0.9.5\|0.9.6\|1.0.0\|1.0.1\|1.0.2-alpha\|1.0.2\|1.0.3\|1.1.0\|1.1.1\|1.1.2\|1.1.3\|1.1.4\|1.2.0\|1.2.1\|1.2.2\|1.2.3\|2.0.0-beta\|2.0.0\|2.0.1\|2.1.0\|2.1.1\|3.0.0-alpha.0\|3.0.0-beta.2\|3.0.0-beta.3\|3.0.0-beta.4\|3.0.0-beta.5\|3.0.0-beta.7\|3.0.0\|3.1.0\|3.1.1\|3.1.2\|3.2.0\|3.3.0\|3.3.1\|3.3.2\|3.3.3\|3.4.0-beta.2\|3.4.0-beta1\|3.4.0\|3.4.1\|3.4.2\|3.5.0-beta.1\|3.5.1\|3.5.2\|3.5.3\|3.6.0\|3.7.0\|3.8.0\|3.9.0\|3.9.1\|3.9.2\|3.9.3\|3.10.0-1\|3.10.0\|3.10.1\|3.11.0\|3.11.1\|3.11.2\|3.11.3\|3.12.0\|3.12.1\|3.12.2\|3.12.3\|3.12.4\|3.12.5\|3.13.0\|3.13.1\|3.14.0-0\|4.0.0\|4.1.0\|4.1.1\|4.2.0\|4.3.0\|4.4.0\|4.5.0\|4.5.1\|4.5.2\|4.5.3\|4.6.0\|4.6.1\|4.7.1\|4.7.2\|4.8.1\|4.8.2\|4.8.3\|4.9.0\|4.9.1\|4.9.2\|4.9.3\|4.9.4\|4.10.0\|4.11.0\|4.12.0\|4.13.0\|4.13.1\|4.14.0\|4.14.1\|5.0.0\|6.0.0\|6.0.1\|7.0.0\|7.0.1\|7.0.2\|7.0.3\|8.0.0\|9.0.0` |
| Date from the source | The source gives no day |
| Replacement | sass |
| Evidence last seen | 2026-10-30 |
| Reviewed | 2026-10-30 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-30 (365 days after the last review) |
| Rule ID | `npm.package.node-sass.deprecated` |

## Sources

- [node-sass package deprecation notice](https://www.npmjs.com/package/node-sass)
- [node-sass registry metadata](https://registry.npmjs.org/node-sass)

## Migration

**Constraints**

- Preserve Sass include paths, importer behavior, output style, source maps, and generated CSS expected by the build.

**Steps**

1. **Replace Node Sass.** Remove node-sass and add the maintained sass package in the same dependency section.
2. **Update compiler usages.** Migrate render and renderSync imports and options to the supported Sass interface used by the project.
3. **Compare compiled output.** Review generated CSS and source maps for behaviorally relevant differences.

**Verification**

- `npm run test --if-present`: Run stylesheet and repository tests when defined.
- `npm run build --if-present`: Compile the project and its stylesheets with Sass.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.node-sass.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.node-sass.deprecated.html",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.node-sass.deprecated.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.node-sass.deprecated.html",
      "headline": "node-sass is deprecated — dates, impact, migration",
      "description": "npm marks node-sass as deprecated: \"Node Sass is no longer supported. Please use `sass` or `sass-embedded` instead.\"",
      "inLanguage": "en",
      "dateModified": "2026-10-30",
      "keywords": [
        "deprecated",
        "npm",
        "medium"
      ],
      "about": {
        "@type": "Thing",
        "name": "node-sass is deprecated",
        "identifier": "pkg:npm/node-sass"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "node-sass package deprecation notice",
          "url": "https://www.npmjs.com/package/node-sass"
        },
        {
          "@type": "CreativeWork",
          "name": "node-sass registry metadata",
          "url": "https://registry.npmjs.org/node-sass"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.node-sass.deprecated.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.node-sass.deprecated.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:npm/node-sass?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated. The source gives no day. Affected versions: vers:npm/0.2.0|0.2.1|0.2.2|0.2.3|0.2.4|0.2.5|0.2.6|0.3.0|0.4.0|0.4.1|0.4.2|0.4.3|0.4.4|0.5.0|0.5.1|0.5.2|0.5.3|0.5.4|0.6.0|0.6.1|0.6.2|0.6.3|0.6.4|0.6.5|0.6.6|0.6.7|0.7.0-alpha|0.7.0|0.8.0|0.8.1|0.8.2|0.8.3|0.8.4|0.8.5|0.8.6|0.9.0|0.9.1|0.9.2|0.9.3|0.9.4-rc1|0.9.4|0.9.5-rc1|0.9.5|0.9.6|1.0.0|1.0.1|1.0.2-alpha|1.0.2|1.0.3|1.1.0|1.1.1|1.1.2|1.1.3|1.1.4|1.2.0|1.2.1|1.2.2|1.2.3|2.0.0-beta|2.0.0|2.0.1|2.1.0|2.1.1|3.0.0-alpha.0|3.0.0-beta.2|3.0.0-beta.3|3.0.0-beta.4|3.0.0-beta.5|3.0.0-beta.7|3.0.0|3.1.0|3.1.1|3.1.2|3.2.0|3.3.0|3.3.1|3.3.2|3.3.3|3.4.0-beta.2|3.4.0-beta1|3.4.0|3.4.1|3.4.2|3.5.0-beta.1|3.5.1|3.5.2|3.5.3|3.6.0|3.7.0|3.8.0|3.9.0|3.9.1|3.9.2|3.9.3|3.10.0-1|3.10.0|3.10.1|3.11.0|3.11.1|3.11.2|3.11.3|3.12.0|3.12.1|3.12.2|3.12.3|3.12.4|3.12.5|3.13.0|3.13.1|3.14.0-0|4.0.0|4.1.0|4.1.1|4.2.0|4.3.0|4.4.0|4.5.0|4.5.1|4.5.2|4.5.3|4.6.0|4.6.1|4.7.1|4.7.2|4.8.1|4.8.2|4.8.3|4.9.0|4.9.1|4.9.2|4.9.3|4.9.4|4.10.0|4.11.0|4.12.0|4.13.0|4.13.1|4.14.0|4.14.1|5.0.0|6.0.0|6.0.1|7.0.0|7.0.1|7.0.2|7.0.3|8.0.0|9.0.0. Source: node-sass package deprecation notice (https://www.npmjs.com/package/node-sass)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:npm/node-sass?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "sass"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:npm/node-sass?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:npm/node-sass."
          }
        }
      ]
    }
  ]
}
</script>
