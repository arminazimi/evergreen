---
title: "are-we-there-yet is no longer supported — dates, impact, migration"
description: "npm states that the are-we-there-yet package is no longer supported."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.are-we-there-yet.eol.html"
json_twin: "/rules/npm.package.are-we-there-yet.eol.json"
---

# are-we-there-yet is no longer supported

**End of life.** The source gives no day. Source: [are-we-there-yet package deprecation notice](https://www.npmjs.com/package/are-we-there-yet).

Check a version:

```bash
evergreen check pkg:npm/are-we-there-yet
```

npm states that the are-we-there-yet package is no longer supported.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `npm` |
| Component | `pkg:npm/are-we-there-yet` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.are-we-there-yet.eol` |

## Sources

- [are-we-there-yet package deprecation notice](https://www.npmjs.com/package/are-we-there-yet)
- [are-we-there-yet registry metadata](https://registry.npmjs.org/are-we-there-yet/latest)

## Migration

**Constraints**

- Preserve weighted completion, nested tracker groups, stream progress, event timing, and completion semantics.

**Steps**

1. **Replace progress tracking.** Select a maintained progress tracker or implement the required aggregation locally, migrate tracker construction and updates, then remove the package.

**Verification**

- `npm run test --if-present`: Run nested progress, completion, event, and repository tests.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.are-we-there-yet.eol`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.are-we-there-yet.eol.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.are-we-there-yet.eol.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.are-we-there-yet.eol.html",
  "headline": "are-we-there-yet is no longer supported — dates, impact, migration",
  "description": "npm states that the are-we-there-yet package is no longer supported.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "end-of-life",
    "npm",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "are-we-there-yet is no longer supported",
    "identifier": "pkg:npm/are-we-there-yet"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "are-we-there-yet package deprecation notice",
      "url": "https://www.npmjs.com/package/are-we-there-yet"
    },
    {
      "@type": "CreativeWork",
      "name": "are-we-there-yet registry metadata",
      "url": "https://registry.npmjs.org/are-we-there-yet/latest"
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
