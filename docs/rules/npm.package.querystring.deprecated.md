---
title: "querystring is deprecated — dates, impact, migration"
description: "npm describes the querystring API as legacy and recommends URLSearchParams for new code."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.querystring.deprecated.html"
json_twin: "/rules/npm.package.querystring.deprecated.json"
---

# querystring is deprecated

**Deprecated.** The source gives no day. Replacement: URLSearchParams. Source: [querystring package deprecation notice](https://www.npmjs.com/package/querystring).

Check a version:

```bash
evergreen check pkg:npm/querystring
```

npm describes the querystring API as legacy and recommends URLSearchParams for new code.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/querystring` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | URLSearchParams |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.querystring.deprecated` |

## Sources

- [querystring package deprecation notice](https://www.npmjs.com/package/querystring)
- [querystring registry metadata](https://registry.npmjs.org/querystring/latest)

## Migration

**Constraints**

- Preserve percent encoding, repeated keys, empty values, ordering, array handling, and input coercion expected by callers.

**Steps**

1. **Replace querystring.** Translate parse and stringify usages to URLSearchParams and remove the querystring dependency.
2. **Verify query-string behavior.** Compare representative and malformed inputs, including repeated keys and non-ASCII values, before and after migration.

**Verification**

- `npm run test --if-present`: Run query parsing, serialization, and repository tests.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.querystring.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.querystring.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.querystring.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.querystring.deprecated.html",
  "headline": "querystring is deprecated — dates, impact, migration",
  "description": "npm describes the querystring API as legacy and recommends URLSearchParams for new code.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "deprecated",
    "npm",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "querystring is deprecated",
    "identifier": "pkg:npm/querystring"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "querystring package deprecation notice",
      "url": "https://www.npmjs.com/package/querystring"
    },
    {
      "@type": "CreativeWork",
      "name": "querystring registry metadata",
      "url": "https://registry.npmjs.org/querystring/latest"
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
