---
title: "boom is deprecated — dates, impact, migration"
description: "npm states that boom moved to @hapi/boom and that the old distribution is no longer maintained."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.boom.deprecated.html"
json_twin: "/rules/npm.package.boom.deprecated.json"
---

# boom is deprecated

npm states that boom moved to @hapi/boom and that the old distribution is no longer maintained.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/boom` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | @hapi/boom |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.boom.deprecated` |

## Sources

- [boom package deprecation notice](https://www.npmjs.com/package/boom)
- [boom registry metadata](https://registry.npmjs.org/boom/latest)

## Migration

**Constraints**

- Preserve HTTP status codes, payload shape, headers, and error classification.

**Steps**

1. **Replace boom.** Move the dependency and imports from boom to @hapi/boom and update changed API calls.
2. **Verify HTTP errors.** Compare status codes and serialized error payloads for every affected error path.

**Verification**

- `npm run test --if-present`: Run HTTP error behavior and repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.boom.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.boom.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.boom.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.boom.deprecated.html",
  "headline": "boom is deprecated — dates, impact, migration",
  "description": "npm states that boom moved to @hapi/boom and that the old distribution is no longer maintained.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "deprecated",
    "npm",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "boom is deprecated",
    "identifier": "pkg:npm/boom"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "boom package deprecation notice",
      "url": "https://www.npmjs.com/package/boom"
    },
    {
      "@type": "CreativeWork",
      "name": "boom registry metadata",
      "url": "https://registry.npmjs.org/boom/latest"
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
