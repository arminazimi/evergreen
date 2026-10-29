---
title: "w3c-hr-time is deprecated — dates, impact, migration"
description: "npm directs users of w3c-hr-time to native performance.now() and performance.timeOrigin."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.w3c-hr-time.deprecated.html"
---

# w3c-hr-time is deprecated

npm directs users of w3c-hr-time to native performance.now() and performance.timeOrigin.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/w3c-hr-time` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | Native performance.now() and performance.timeOrigin |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.w3c-hr-time.deprecated` |

## Sources

- [w3c-hr-time package deprecation notice](https://www.npmjs.com/package/w3c-hr-time)
- [w3c-hr-time registry metadata](https://registry.npmjs.org/w3c-hr-time/latest)

## Migration

**Constraints**

- Preserve monotonic timing, time-origin assumptions, units, precision expectations, and minimum-runtime support.

**Steps**

1. **Use native high-resolution time.** Replace w3c-hr-time imports and clock reads with native performance.now() and performance.timeOrigin, then remove the dependency.

**Verification**

- `npm run test --if-present`: Run timing behavior and repository tests without relying on exact wall-clock values.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.w3c-hr-time.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.w3c-hr-time.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.w3c-hr-time.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.w3c-hr-time.deprecated.html",
  "headline": "w3c-hr-time is deprecated — dates, impact, migration",
  "description": "npm directs users of w3c-hr-time to native performance.now() and performance.timeOrigin.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "deprecated",
    "npm",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "w3c-hr-time is deprecated",
    "identifier": "pkg:npm/w3c-hr-time"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "w3c-hr-time package deprecation notice",
      "url": "https://www.npmjs.com/package/w3c-hr-time"
    },
    {
      "@type": "CreativeWork",
      "name": "w3c-hr-time registry metadata",
      "url": "https://registry.npmjs.org/w3c-hr-time/latest"
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
