---
title: "Util.log has been removed — dates, impact, migration"
description: "Node.js removed util.log (DEP0059: documentation-only since v6.0.0, runtime deprecation since v22.0.0, end-of-life since v23.0.0)."
canonical_url: "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.util.log.html"
---

# Util.log has been removed

Node.js removed util.log (DEP0059: documentation-only since v6.0.0, runtime deprecation since v22.0.0, end-of-life since v23.0.0).

| | |
| --- | --- |
| Status | Removed |
| Severity | high |
| Ecosystem | `nodejs` |
| Component | `pkg:generic/nodejs` |
| Affected versions | `vers:semver/>=23.0.0` |
| Date from the source | The source gives no day |
| Replacement | a third-party logging library, or console.log(new Date().toLocaleString(), message) |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-10-21 (365 days after the last review) |
| Rule ID | `nodejs.symbol.util.log` |

## Sources

- [Node.js deprecations: DEP0059](https://nodejs.org/api/deprecations.html)

## Migration

**Constraints**

- Keep the behavior of the code unchanged; check the replacement's argument and return-value differences.

**Steps**

1. **Replace the usage.** Replace each reported use of util.log with a third-party logging library, or console.log(new Date().toLocaleString(), message).

**Verification**

- `npm run test --if-present`: Run the repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/nodejs.json`](https://github.com/arminazimi/evergreen/blob/main/registry/nodejs.json), rule `nodejs.symbol.util.log`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.util.log.html",
  "url": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.util.log.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.util.log.html",
  "headline": "Util.log has been removed — dates, impact, migration",
  "description": "Node.js removed util.log (DEP0059: documentation-only since v6.0.0, runtime deprecation since v22.0.0, end-of-life since v23.0.0).",
  "inLanguage": "en",
  "dateModified": "2026-10-21",
  "keywords": [
    "removed",
    "nodejs",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Util.log has been removed",
    "identifier": "pkg:generic/nodejs"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Node.js deprecations: DEP0059",
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
