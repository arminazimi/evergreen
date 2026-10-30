---
title: "Util.isBoolean has been removed — dates, impact, migration"
description: "Node.js removed util.isBoolean (DEP0045: documentation-only since v4.0.0, runtime deprecation since v22.0.0, end-of-life since v23.0.0)."
canonical_url: "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.util.isboolean.html"
json_twin: "/rules/nodejs.symbol.util.isboolean.json"
---

# Util.isBoolean has been removed

**Removed.** The source gives no day. Replacement: typeof arg === 'boolean'. Source: [Node.js deprecations: DEP0045](https://nodejs.org/api/deprecations.html).

Check a version:

```bash
evergreen check pkg:generic/nodejs
```

Node.js removed util.isBoolean (DEP0045: documentation-only since v4.0.0, runtime deprecation since v22.0.0, end-of-life since v23.0.0).

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Removed |
| Severity | high |
| Ecosystem | `nodejs` |
| Component | `pkg:generic/nodejs` |
| Affected versions | `vers:semver/>=23.0.0` |
| Date from the source | The source gives no day |
| Replacement | typeof arg === 'boolean' |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-10-21 (365 days after the last review) |
| Rule ID | `nodejs.symbol.util.isboolean` |

## Sources

- [Node.js deprecations: DEP0045](https://nodejs.org/api/deprecations.html)

## Migration

**Constraints**

- Keep the behavior of the code unchanged; check the replacement's argument and return-value differences.

**Steps**

1. **Replace the usage.** Replace each reported use of util.isBoolean with typeof arg === 'boolean'.

**Verification**

- `npm run test --if-present`: Run the repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/nodejs.json`](https://github.com/arminazimi/evergreen/blob/main/registry/nodejs.json), rule `nodejs.symbol.util.isboolean`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.util.isboolean.html",
  "url": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.util.isboolean.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.util.isboolean.html",
  "headline": "Util.isBoolean has been removed — dates, impact, migration",
  "description": "Node.js removed util.isBoolean (DEP0045: documentation-only since v4.0.0, runtime deprecation since v22.0.0, end-of-life since v23.0.0).",
  "inLanguage": "en",
  "dateModified": "2026-10-21",
  "keywords": [
    "removed",
    "nodejs",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Util.isBoolean has been removed",
    "identifier": "pkg:generic/nodejs"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Node.js deprecations: DEP0045",
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
