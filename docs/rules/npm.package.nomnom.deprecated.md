---
title: "nomnom is deprecated — dates, impact, migration"
description: "npm states that nomnom is no longer supported."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.nomnom.deprecated.html"
json_twin: "/rules/npm.package.nomnom.deprecated.json"
---

# nomnom is deprecated

**Deprecated.** The source gives no day. Source: [nomnom package deprecation notice](https://www.npmjs.com/package/nomnom).

Check a version:

```bash
evergreen check pkg:npm/nomnom
```

npm states that nomnom is no longer supported.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

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

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.nomnom.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.nomnom.deprecated.html",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.nomnom.deprecated.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.nomnom.deprecated.html",
      "headline": "nomnom is deprecated — dates, impact, migration",
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
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.nomnom.deprecated.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.nomnom.deprecated.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:npm/nomnom?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated. The source gives no day. Affected versions: vers:npm/*. Source: nomnom package deprecation notice (https://www.npmjs.com/package/nomnom)."
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:npm/nomnom?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:npm/nomnom."
          }
        }
      ]
    }
  ]
}
</script>
