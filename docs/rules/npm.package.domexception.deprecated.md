---
title: "domexception is deprecated — dates, impact, migration"
description: "npm directs users of domexception to the platform-native DOMException implementation."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.domexception.deprecated.html"
---

# domexception is deprecated

npm directs users of domexception to the platform-native DOMException implementation.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/domexception` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | Native DOMException |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.domexception.deprecated` |

## Sources

- [domexception package deprecation notice](https://www.npmjs.com/package/domexception)
- [domexception registry metadata](https://registry.npmjs.org/domexception/latest)

## Migration

**Constraints**

- Preserve exception names, messages, codes where consumed, instanceof checks, serialization, and minimum-runtime support.

**Steps**

1. **Use native DOMException.** Replace domexception imports and constructors with the global DOMException implementation, then remove the dependency.

**Verification**

- `npm run test --if-present`: Run exception behavior and repository tests.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.domexception.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.domexception.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.domexception.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.domexception.deprecated.html",
  "headline": "domexception is deprecated — dates, impact, migration",
  "description": "npm directs users of domexception to the platform-native DOMException implementation.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "deprecated",
    "npm",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "domexception is deprecated",
    "identifier": "pkg:npm/domexception"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "domexception package deprecation notice",
      "url": "https://www.npmjs.com/package/domexception"
    },
    {
      "@type": "CreativeWork",
      "name": "domexception registry metadata",
      "url": "https://registry.npmjs.org/domexception/latest"
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
