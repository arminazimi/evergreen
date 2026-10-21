---
title: "Tls.SecurePair has been removed — dates, impact, migration"
description: "Node.js removed tls.SecurePair (DEP0043: documentation-only since v6.0.0, runtime deprecation since v8.0.0, end-of-life since v24.0.0)."
canonical_url: "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.tls.securepair.html"
---

# Tls.SecurePair has been removed

Node.js removed tls.SecurePair (DEP0043: documentation-only since v6.0.0, runtime deprecation since v8.0.0, end-of-life since v24.0.0).

| | |
| --- | --- |
| Status | Removed |
| Severity | high |
| Ecosystem | `nodejs` |
| Component | `pkg:generic/nodejs` |
| Affected versions | `vers:semver/>=24.0.0` |
| Date from the source | The source gives no day |
| Replacement | tls.TLSSocket |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-10-21 (365 days after the last review) |
| Rule ID | `nodejs.symbol.tls.securepair` |

## Sources

- [Node.js deprecations: DEP0043](https://nodejs.org/api/deprecations.html)

## Migration

**Constraints**

- Keep the behavior of the code unchanged; check the replacement's argument and return-value differences.

**Steps**

1. **Replace the usage.** Replace each reported use of tls.SecurePair with tls.TLSSocket.

**Verification**

- `npm run test --if-present`: Run the repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/nodejs.json`](https://github.com/arminazimi/evergreen/blob/main/registry/nodejs.json), rule `nodejs.symbol.tls.securepair`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.tls.securepair.html",
  "url": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.tls.securepair.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.tls.securepair.html",
  "headline": "Tls.SecurePair has been removed — dates, impact, migration",
  "description": "Node.js removed tls.SecurePair (DEP0043: documentation-only since v6.0.0, runtime deprecation since v8.0.0, end-of-life since v24.0.0).",
  "inLanguage": "en",
  "dateModified": "2026-10-21",
  "keywords": [
    "removed",
    "nodejs",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Tls.SecurePair has been removed",
    "identifier": "pkg:generic/nodejs"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Node.js deprecations: DEP0043",
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
