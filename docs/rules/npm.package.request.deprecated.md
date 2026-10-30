---
title: "request is deprecated — dates, impact, migration"
description: "The package is fully deprecated and no new changes are expected."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.request.deprecated.html"
json_twin: "/rules/npm.package.request.deprecated.json"
---

# request is deprecated

**Deprecated** as of 2020-02-11. Replacement: Native fetch or a maintained HTTP client. Source: [request package deprecation notice](https://www.npmjs.com/package/request).

Check a version:

```bash
evergreen check pkg:npm/request
```

The package is fully deprecated and no new changes are expected.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | high |
| Ecosystem | `npm` |
| Component | `pkg:npm/request` |
| Affected versions | `vers:npm/*` |
| Date from the source | 2020-02-11 |
| Replacement | Native fetch or a maintained HTTP client |
| Evidence last seen | 2026-10-13 |
| Reviewed | 2026-10-14 by arminazimi |
| Review due | 2027-10-14 (365 days after the last review) |
| Rule ID | `npm.package.request.deprecated` |

## Sources

- [request package deprecation notice](https://www.npmjs.com/package/request)

## Migration

**Constraints**

- Preserve request method, headers, authentication, redirects, timeouts, retries, proxy behavior, streaming, and response/error semantics used by each call site.

**Steps**

1. **Choose the target HTTP client.** Select native fetch or one maintained client whose behavior covers the affected request usages.
2. **Rewrite request usages.** Translate callbacks, options, response handling, errors, and streams at every reported import and call.
3. **Replace the dependency.** Remove request from package metadata and add the selected maintained client only if native fetch is insufficient.

**Verification**

- `npm run test --if-present`: Run HTTP behavior and repository tests when defined.
- `npm run build --if-present`: Verify imports, types, and the build remain valid.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.request.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.request.deprecated.html",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.request.deprecated.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.request.deprecated.html",
      "headline": "request is deprecated — dates, impact, migration",
      "description": "The package is fully deprecated and no new changes are expected.",
      "inLanguage": "en",
      "dateModified": "2026-10-14",
      "keywords": [
        "deprecated",
        "npm",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "request is deprecated",
        "identifier": "pkg:npm/request"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "request package deprecation notice",
          "url": "https://www.npmjs.com/package/request"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.request.deprecated.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.request.deprecated.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:npm/request?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated as of 2020-02-11. Affected versions: vers:npm/*. Source: request package deprecation notice (https://www.npmjs.com/package/request)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:npm/request?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Native fetch or a maintained HTTP client"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:npm/request?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:npm/request."
          }
        }
      ]
    }
  ]
}
</script>
