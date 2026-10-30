---
title: "resolve-url is deprecated — dates, impact, migration"
description: "The maintainer deprecated resolve-url and recommends the platform URL API for resolving URLs in browsers."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.resolve-url.deprecated.html"
json_twin: "/rules/npm.package.resolve-url.deprecated.json"
---

# resolve-url is deprecated

**Deprecated.** The source gives no day. Replacement: URL. Source: [resolve-url maintainer deprecation notice](https://github.com/lydell/resolve-url#deprecated).

Check a version:

```bash
evergreen check pkg:npm/resolve-url
```

The maintainer deprecated resolve-url and recommends the platform URL API for resolving URLs in browsers.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/resolve-url` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | URL |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.resolve-url.deprecated` |

## Sources

- [resolve-url maintainer deprecation notice](https://github.com/lydell/resolve-url#deprecated)
- [resolve-url registry metadata](https://registry.npmjs.org/resolve-url/latest)

## Migration

**Constraints**

- Preserve base URL selection, sequential resolution, protocol-relative URLs, absolute URLs, encoding, and browser compatibility.

**Steps**

1. **Use the URL API.** Replace resolve-url calls with URL construction, applying each base explicitly and returning the same string form expected by callers.

**Verification**

- `npm run test --if-present`: Run relative, absolute, protocol-relative, encoded, multi-base, and repository tests.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.resolve-url.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.resolve-url.deprecated.html",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.resolve-url.deprecated.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.resolve-url.deprecated.html",
      "headline": "resolve-url is deprecated — dates, impact, migration",
      "description": "The maintainer deprecated resolve-url and recommends the platform URL API for resolving URLs in browsers.",
      "inLanguage": "en",
      "dateModified": "2026-10-16",
      "keywords": [
        "deprecated",
        "npm",
        "medium"
      ],
      "about": {
        "@type": "Thing",
        "name": "resolve-url is deprecated",
        "identifier": "pkg:npm/resolve-url"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "resolve-url maintainer deprecation notice",
          "url": "https://github.com/lydell/resolve-url#deprecated"
        },
        {
          "@type": "CreativeWork",
          "name": "resolve-url registry metadata",
          "url": "https://registry.npmjs.org/resolve-url/latest"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.resolve-url.deprecated.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.resolve-url.deprecated.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:npm/resolve-url?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated. The source gives no day. Affected versions: vers:npm/*. Source: resolve-url maintainer deprecation notice (https://github.com/lydell/resolve-url#deprecated)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:npm/resolve-url?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "URL"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:npm/resolve-url?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:npm/resolve-url."
          }
        }
      ]
    }
  ]
}
</script>
