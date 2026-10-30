---
title: "osenv is no longer supported — dates, impact, migration"
description: "npm states that the osenv package is no longer supported."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.osenv.eol.html"
json_twin: "/rules/npm.package.osenv.eol.json"
---

# osenv is no longer supported

**End of life.** The source gives no day. Source: [osenv package deprecation notice](https://www.npmjs.com/package/osenv).

Check a version:

```bash
evergreen check pkg:npm/osenv
```

npm states that the osenv package is no longer supported.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `npm` |
| Component | `pkg:npm/osenv` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.osenv.eol` |

## Sources

- [osenv package deprecation notice](https://www.npmjs.com/package/osenv)
- [osenv registry metadata](https://registry.npmjs.org/osenv/latest)

## Migration

**Constraints**

- Preserve platform-specific home, temp, editor, shell, path, and environment-variable fallback behavior actually used by the application.

**Steps**

1. **Replace operating-system environment helpers.** Replace each osenv helper with maintained runtime APIs and explicit environment-variable handling, then remove osenv.

**Verification**

- `npm run test --if-present`: Run environment resolution and cross-platform repository tests.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.osenv.eol`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.osenv.eol.html",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.osenv.eol.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.osenv.eol.html",
      "headline": "osenv is no longer supported — dates, impact, migration",
      "description": "npm states that the osenv package is no longer supported.",
      "inLanguage": "en",
      "dateModified": "2026-10-16",
      "keywords": [
        "end-of-life",
        "npm",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "osenv is no longer supported",
        "identifier": "pkg:npm/osenv"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "osenv package deprecation notice",
          "url": "https://www.npmjs.com/package/osenv"
        },
        {
          "@type": "CreativeWork",
          "name": "osenv registry metadata",
          "url": "https://registry.npmjs.org/osenv/latest"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.osenv.eol.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.osenv.eol.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:npm/osenv?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life. The source gives no day. Affected versions: vers:npm/*. Source: osenv package deprecation notice (https://www.npmjs.com/package/osenv)."
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:npm/osenv?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:npm/osenv."
          }
        }
      ]
    }
  ]
}
</script>
