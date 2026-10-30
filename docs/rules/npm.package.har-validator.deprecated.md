---
title: "har-validator is deprecated — dates, impact, migration"
description: "npm states that har-validator is no longer supported."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.har-validator.deprecated.html"
json_twin: "/rules/npm.package.har-validator.deprecated.json"
---

# har-validator is deprecated

**Deprecated.** The source gives no day. Source: [har-validator package deprecation notice](https://www.npmjs.com/package/har-validator).

Check a version:

```bash
evergreen check pkg:npm/har-validator
```

npm states that har-validator is no longer supported.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/har-validator` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.har-validator.deprecated` |

## Sources

- [har-validator package deprecation notice](https://www.npmjs.com/package/har-validator)
- [har-validator registry metadata](https://registry.npmjs.org/har-validator/latest)

## Migration

**Constraints**

- Preserve the accepted HAR specification version, validation strictness, and error reporting.

**Steps**

1. **Select a maintained HAR validator.** Choose a maintained validator that supports the project's HAR version and required validation semantics.
2. **Replace validation calls.** Translate har-validator calls and handle the replacement's result and error format explicitly.

**Verification**

- `npm run test --if-present`: Run valid and invalid HAR fixtures and repository tests.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.har-validator.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.har-validator.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.har-validator.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.har-validator.deprecated.html",
  "headline": "har-validator is deprecated — dates, impact, migration",
  "description": "npm states that har-validator is no longer supported.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "deprecated",
    "npm",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "har-validator is deprecated",
    "identifier": "pkg:npm/har-validator"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "har-validator package deprecation notice",
      "url": "https://www.npmjs.com/package/har-validator"
    },
    {
      "@type": "CreativeWork",
      "name": "har-validator registry metadata",
      "url": "https://registry.npmjs.org/har-validator/latest"
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
