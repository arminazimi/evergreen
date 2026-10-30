---
title: "util._extend is deprecated — dates, impact, migration"
description: "Node.js deprecates util._extend() (DEP0060): documentation-only since v6.0.0, runtime warning since v22.0.0."
canonical_url: "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.util.extend.html"
---

# util._extend is deprecated

**Deprecated.** The source gives no day. Replacement: Object.assign(target, source). Source: [Node.js deprecations: DEP0060 util._extend](https://nodejs.org/api/deprecations.html).

Check a version:

```bash
evergreen check pkg:generic/nodejs
```

Node.js deprecates util._extend() (DEP0060): documentation-only since v6.0.0, runtime warning since v22.0.0.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | low |
| Ecosystem | `nodejs` |
| Component | `pkg:generic/nodejs` |
| Affected versions | `vers:semver/>=6.0.0` |
| Date from the source | The source gives no day |
| Replacement | Object.assign(target, source) |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-10-21 (365 days after the last review) |
| Rule ID | `nodejs.symbol.util.extend` |

## Sources

- [Node.js deprecations: DEP0060 util._extend](https://nodejs.org/api/deprecations.html)

## Migration

**Constraints**

- Keep the behavior of the call unchanged; check the replacement's argument and error handling differences.

**Steps**

1. **Replace util._extend.** Replace each reported util._extend(target, source) with Object.assign(target, source).

**Verification**

- `npm run test --if-present`: Run the repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/nodejs.json`](https://github.com/arminazimi/evergreen/blob/main/registry/nodejs.json), rule `nodejs.symbol.util.extend`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.util.extend.html",
  "url": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.util.extend.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.util.extend.html",
  "headline": "util._extend is deprecated — dates, impact, migration",
  "description": "Node.js deprecates util._extend() (DEP0060): documentation-only since v6.0.0, runtime warning since v22.0.0.",
  "inLanguage": "en",
  "dateModified": "2026-10-21",
  "keywords": [
    "deprecated",
    "nodejs",
    "low"
  ],
  "about": {
    "@type": "Thing",
    "name": "util._extend is deprecated",
    "identifier": "pkg:generic/nodejs"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Node.js deprecations: DEP0060 util._extend",
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
