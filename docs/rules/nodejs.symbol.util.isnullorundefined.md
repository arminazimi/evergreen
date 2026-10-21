---
title: "Util.isNullOrUndefined has been removed — dates, impact, migration"
description: "Node.js removed util.isNullOrUndefined (DEP0051: documentation-only since v4.0.0, runtime deprecation since v22.0.0, end-of-life since v23.0.0)."
canonical_url: "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.util.isnullorundefined.html"
---

# Util.isNullOrUndefined has been removed

Node.js removed util.isNullOrUndefined (DEP0051: documentation-only since v4.0.0, runtime deprecation since v22.0.0, end-of-life since v23.0.0).

| | |
| --- | --- |
| Status | Removed |
| Severity | high |
| Ecosystem | `nodejs` |
| Component | `pkg:generic/nodejs` |
| Affected versions | `vers:semver/>=23.0.0` |
| Date from the source | The source gives no day |
| Replacement | arg === null \|\| arg === undefined |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-10-21 (365 days after the last review) |
| Rule ID | `nodejs.symbol.util.isnullorundefined` |

## Sources

- [Node.js deprecations: DEP0051](https://nodejs.org/api/deprecations.html)

## Migration

**Constraints**

- Keep the behavior of the code unchanged; check the replacement's argument and return-value differences.

**Steps**

1. **Replace the usage.** Replace each reported use of util.isNullOrUndefined with arg === null || arg === undefined.

**Verification**

- `npm run test --if-present`: Run the repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/nodejs.json`](https://github.com/arminazimi/evergreen/blob/main/registry/nodejs.json), rule `nodejs.symbol.util.isnullorundefined`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.util.isnullorundefined.html",
  "url": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.util.isnullorundefined.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.util.isnullorundefined.html",
  "headline": "Util.isNullOrUndefined has been removed — dates, impact, migration",
  "description": "Node.js removed util.isNullOrUndefined (DEP0051: documentation-only since v4.0.0, runtime deprecation since v22.0.0, end-of-life since v23.0.0).",
  "inLanguage": "en",
  "dateModified": "2026-10-21",
  "keywords": [
    "removed",
    "nodejs",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Util.isNullOrUndefined has been removed",
    "identifier": "pkg:generic/nodejs"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Node.js deprecations: DEP0051",
      "url": "https://nodejs.org/api/deprecations.html"
    }
  ],
  "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/nodejs.json",
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen"
  }
}
</script>
