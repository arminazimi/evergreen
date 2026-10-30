---
title: "q is deprecated — dates, impact, migration"
description: "The q maintainer states that consumers can almost certainly migrate to native JavaScript promises."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.q.deprecated.html"
json_twin: "/rules/npm.package.q.deprecated.json"
---

# q is deprecated

**Deprecated.** The source gives no day. Replacement: Native Promise. Source: [q package deprecation notice](https://www.npmjs.com/package/q).

Check a version:

```bash
evergreen check pkg:npm/q
```

The q maintainer states that consumers can almost certainly migrate to native JavaScript promises.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | high |
| Ecosystem | `npm` |
| Component | `pkg:npm/q` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | Native Promise |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.q.deprecated` |

## Sources

- [q package deprecation notice](https://www.npmjs.com/package/q)
- [q registry metadata](https://registry.npmjs.org/q/latest)

## Migration

**Constraints**

- Preserve fulfillment and rejection timing, chaining, progress behavior where used, error propagation, and cancellation assumptions.

**Steps**

1. **Audit Q-specific behavior.** Identify Q-only APIs and semantic assumptions before translating promise chains.
2. **Use native promises.** Rewrite Q construction, combinators, and chains with native Promise and async/await equivalents, then remove q.

**Verification**

- `npm run test --if-present`: Run asynchronous success, rejection, ordering, and repository tests.

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

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.q.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.q.deprecated.html",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.q.deprecated.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.q.deprecated.html",
      "headline": "q is deprecated — dates, impact, migration",
      "description": "The q maintainer states that consumers can almost certainly migrate to native JavaScript promises.",
      "inLanguage": "en",
      "dateModified": "2026-10-16",
      "keywords": [
        "deprecated",
        "npm",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "q is deprecated",
        "identifier": "pkg:npm/q"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "q package deprecation notice",
          "url": "https://www.npmjs.com/package/q"
        },
        {
          "@type": "CreativeWork",
          "name": "q registry metadata",
          "url": "https://registry.npmjs.org/q/latest"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.q.deprecated.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.q.deprecated.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:npm/q?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated. The source gives no day. Affected versions: vers:npm/*. Source: q package deprecation notice (https://www.npmjs.com/package/q)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:npm/q?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Native Promise"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:npm/q?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:npm/q."
          }
        }
      ]
    }
  ]
}
</script>
