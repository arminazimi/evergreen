---
title: "fs.exists is deprecated — dates, impact, migration"
description: "Node.js documents fs.exists(path, callback) as deprecated (DEP0034, documentation-only since v1.0.0)."
canonical_url: "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.fs.exists.html"
json_twin: "/rules/nodejs.symbol.fs.exists.json"
---

# fs.exists is deprecated

Node.js documents fs.exists(path, callback) as deprecated (DEP0034, documentation-only since v1.0.0).

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | low |
| Ecosystem | `nodejs` |
| Component | `pkg:generic/nodejs` |
| Affected versions | `vers:semver/>=1.0.0` |
| Date from the source | The source gives no day |
| Replacement | fs.stat() or fs.access() |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-10-21 (365 days after the last review) |
| Rule ID | `nodejs.symbol.fs.exists` |

## Sources

- [Node.js deprecations: DEP0034 fs.exists](https://nodejs.org/api/deprecations.html)

## Migration

**Constraints**

- Keep the behavior of the call unchanged; check the replacement's argument and error handling differences.

**Steps**

1. **Replace fs.exists.** Replace each reported fs.exists call with fs.access or fs.stat and handle the error instead of the boolean.

**Verification**

- `npm run test --if-present`: Run the repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/nodejs.json`](https://github.com/arminazimi/evergreen/blob/main/registry/nodejs.json), rule `nodejs.symbol.fs.exists`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.fs.exists.html",
  "url": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.fs.exists.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.fs.exists.html",
  "headline": "fs.exists is deprecated — dates, impact, migration",
  "description": "Node.js documents fs.exists(path, callback) as deprecated (DEP0034, documentation-only since v1.0.0).",
  "inLanguage": "en",
  "dateModified": "2026-10-21",
  "keywords": [
    "deprecated",
    "nodejs",
    "low"
  ],
  "about": {
    "@type": "Thing",
    "name": "fs.exists is deprecated",
    "identifier": "pkg:generic/nodejs"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Node.js deprecations: DEP0034 fs.exists",
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
