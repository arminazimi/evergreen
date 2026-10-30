---
title: "fstream is no longer supported — dates, impact, migration"
description: "npm states that the fstream package is no longer supported."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.fstream.eol.html"
json_twin: "/rules/npm.package.fstream.eol.json"
---

# fstream is no longer supported

**End of life.** The source gives no day. Source: [fstream package deprecation notice](https://www.npmjs.com/package/fstream).

Check a version:

```bash
evergreen check pkg:npm/fstream
```

npm states that the fstream package is no longer supported.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `npm` |
| Component | `pkg:npm/fstream` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.fstream.eol` |

## Sources

- [fstream package deprecation notice](https://www.npmjs.com/package/fstream)
- [fstream registry metadata](https://registry.npmjs.org/fstream/latest)

## Migration

**Constraints**

- Preserve filesystem traversal, filtering, permissions, ownership, symlink handling, stream backpressure, and archive boundary security.

**Steps**

1. **Replace filesystem streaming.** Select maintained filesystem and archive primitives for the used fstream behavior, migrate readers and writers, then remove fstream.

**Verification**

- `npm run test --if-present`: Run files, directories, symlinks, permissions, errors, and repository tests.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.fstream.eol`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.fstream.eol.html",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.fstream.eol.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.fstream.eol.html",
      "headline": "fstream is no longer supported — dates, impact, migration",
      "description": "npm states that the fstream package is no longer supported.",
      "inLanguage": "en",
      "dateModified": "2026-10-16",
      "keywords": [
        "end-of-life",
        "npm",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "fstream is no longer supported",
        "identifier": "pkg:npm/fstream"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "fstream package deprecation notice",
          "url": "https://www.npmjs.com/package/fstream"
        },
        {
          "@type": "CreativeWork",
          "name": "fstream registry metadata",
          "url": "https://registry.npmjs.org/fstream/latest"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.fstream.eol.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.fstream.eol.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:npm/fstream?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life. The source gives no day. Affected versions: vers:npm/*. Source: fstream package deprecation notice (https://www.npmjs.com/package/fstream)."
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:npm/fstream?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:npm/fstream."
          }
        }
      ]
    }
  ]
}
</script>
