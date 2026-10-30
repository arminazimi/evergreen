---
title: "request-promise-native is deprecated — dates, impact, migration"
description: "npm states that request-promise-native is deprecated because it extends the deprecated request package."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.request-promise-native.deprecated.html"
json_twin: "/rules/npm.package.request-promise-native.deprecated.json"
---

# request-promise-native is deprecated

**Deprecated.** The source gives no day. Replacement: Native fetch or a maintained promise-based HTTP client. Source: [request-promise-native package deprecation notice](https://www.npmjs.com/package/request-promise-native).

Check a version:

```bash
evergreen check pkg:npm/request-promise-native
```

npm states that request-promise-native is deprecated because it extends the deprecated request package.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | high |
| Ecosystem | `npm` |
| Component | `pkg:npm/request-promise-native` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | Native fetch or a maintained promise-based HTTP client |
| Replacement requires | Node.js 18.0.0 or newer |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.request-promise-native.deprecated` |

## Sources

- [request-promise-native package deprecation notice](https://www.npmjs.com/package/request-promise-native)
- [request-promise-native registry metadata](https://registry.npmjs.org/request-promise-native/latest)
- [Node.js 18 release announcement: global fetch](https://nodejs.org/en/blog/announcements/v18-release-announce)

## Migration

**Constraints**

- Preserve request options, authentication, redirects, timeouts, transforms, full-response mode, and native-Promise rejection behavior.

**Steps**

1. **Select the target HTTP client.** Choose native fetch or one maintained promise-based client that covers the affected request-promise-native behavior.
2. **Replace request-promise-native.** Rewrite requests, response handling, and errors for the selected client, then remove request-promise-native.

**Verification**

- `npm run test --if-present`: Run HTTP behavior and repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.request-promise-native.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.request-promise-native.deprecated.html",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.request-promise-native.deprecated.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.request-promise-native.deprecated.html",
      "headline": "request-promise-native is deprecated — dates, impact, migration",
      "description": "npm states that request-promise-native is deprecated because it extends the deprecated request package.",
      "inLanguage": "en",
      "dateModified": "2026-10-16",
      "keywords": [
        "deprecated",
        "npm",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "request-promise-native is deprecated",
        "identifier": "pkg:npm/request-promise-native"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "request-promise-native package deprecation notice",
          "url": "https://www.npmjs.com/package/request-promise-native"
        },
        {
          "@type": "CreativeWork",
          "name": "request-promise-native registry metadata",
          "url": "https://registry.npmjs.org/request-promise-native/latest"
        },
        {
          "@type": "CreativeWork",
          "name": "Node.js 18 release announcement: global fetch",
          "url": "https://nodejs.org/en/blog/announcements/v18-release-announce"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.request-promise-native.deprecated.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.request-promise-native.deprecated.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:npm/request-promise-native?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated. The source gives no day. Affected versions: vers:npm/*. Source: request-promise-native package deprecation notice (https://www.npmjs.com/package/request-promise-native)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:npm/request-promise-native?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Native fetch or a maintained promise-based HTTP client"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:npm/request-promise-native?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:npm/request-promise-native."
          }
        }
      ]
    }
  ]
}
</script>
