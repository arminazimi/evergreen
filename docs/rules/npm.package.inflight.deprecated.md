---
title: "inflight is deprecated — dates, impact, migration"
description: "npm states that inflight is unsupported, leaks memory, and recommends lru-cache for keyed request coalescing."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.inflight.deprecated.html"
json_twin: "/rules/npm.package.inflight.deprecated.json"
---

# inflight is deprecated

npm states that inflight is unsupported, leaks memory, and recommends lru-cache for keyed request coalescing.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/inflight` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | lru-cache |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.inflight.deprecated` |

## Sources

- [inflight package deprecation notice](https://www.npmjs.com/package/inflight)
- [inflight registry metadata](https://registry.npmjs.org/inflight/latest)

## Migration

**Constraints**

- Preserve request coalescing, callback delivery, cache-key identity, and cleanup on success and failure.

**Steps**

1. **Replace inflight.** Implement keyed coalescing with lru-cache or another maintained primitive and remove inflight.
2. **Verify concurrent behavior.** Test duplicate concurrent requests, failures, retries, and cleanup after completion.

**Verification**

- `npm run test --if-present`: Run concurrency, memory-lifecycle, and repository tests.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.inflight.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.inflight.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.inflight.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.inflight.deprecated.html",
  "headline": "inflight is deprecated — dates, impact, migration",
  "description": "npm states that inflight is unsupported, leaks memory, and recommends lru-cache for keyed request coalescing.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "deprecated",
    "npm",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "inflight is deprecated",
    "identifier": "pkg:npm/inflight"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "inflight package deprecation notice",
      "url": "https://www.npmjs.com/package/inflight"
    },
    {
      "@type": "CreativeWork",
      "name": "inflight registry metadata",
      "url": "https://registry.npmjs.org/inflight/latest"
    }
  ],
  "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/npm.json",
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen"
  }
}
</script>
