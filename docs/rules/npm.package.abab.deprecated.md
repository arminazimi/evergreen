---
title: "abab is deprecated — dates, impact, migration"
description: "npm directs users of abab to the platform-native atob and btoa functions."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.abab.deprecated.html"
---

# abab is deprecated

**Deprecated.** The source gives no day. Replacement: Native atob() and btoa(). Source: [abab package deprecation notice](https://www.npmjs.com/package/abab).

Check a version:

```bash
evergreen check pkg:npm/abab
```

npm directs users of abab to the platform-native atob and btoa functions.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/abab` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | Native atob() and btoa() |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.abab.deprecated` |

## Sources

- [abab package deprecation notice](https://www.npmjs.com/package/abab)
- [abab registry metadata](https://registry.npmjs.org/abab/latest)

## Migration

**Constraints**

- Preserve accepted input, binary-string output, thrown errors, Unicode handling, and support for the project's minimum runtime.

**Steps**

1. **Use platform Base64 functions.** Replace abab imports and calls with the runtime's native atob and btoa functions, then remove the dependency.

**Verification**

- `npm run test --if-present`: Run Base64 edge-case and repository tests.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.abab.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.abab.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.abab.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.abab.deprecated.html",
  "headline": "abab is deprecated — dates, impact, migration",
  "description": "npm directs users of abab to the platform-native atob and btoa functions.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "deprecated",
    "npm",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "abab is deprecated",
    "identifier": "pkg:npm/abab"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "abab package deprecation notice",
      "url": "https://www.npmjs.com/package/abab"
    },
    {
      "@type": "CreativeWork",
      "name": "abab registry metadata",
      "url": "https://registry.npmjs.org/abab/latest"
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
