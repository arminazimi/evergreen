---
title: "Fs.lchmod and fs.lchmodSync are deprecated — dates, impact, migration"
description: "Node.js deprecates fs.lchmod and fs.lchmodSync (DEP0035: documentation-only since v0.4.7)."
canonical_url: "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.fs.lchmod.html"
---

# Fs.lchmod and fs.lchmodSync are deprecated

Node.js deprecates fs.lchmod and fs.lchmodSync (DEP0035: documentation-only since v0.4.7).

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | low |
| Ecosystem | `nodejs` |
| Component | `pkg:generic/nodejs` |
| Affected versions | `vers:semver/>=0.4.7` |
| Date from the source | The source gives no day |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-10-21 (365 days after the last review) |
| Rule ID | `nodejs.symbol.fs.lchmod` |

## Sources

- [Node.js deprecations: DEP0035](https://nodejs.org/api/deprecations.html)

## Migration

**Constraints**

- Keep the behavior of the code unchanged; check the replacement's argument and return-value differences.

**Steps**

1. **Replace the usage.** Replace each reported use of fs.lchmod and fs.lchmodSync with code that no longer depends on it.

**Verification**

- `npm run test --if-present`: Run the repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/nodejs.json`](https://github.com/arminazimi/evergreen/blob/main/registry/nodejs.json), rule `nodejs.symbol.fs.lchmod`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.fs.lchmod.html",
  "url": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.fs.lchmod.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.fs.lchmod.html",
  "headline": "Fs.lchmod and fs.lchmodSync are deprecated — dates, impact, migration",
  "description": "Node.js deprecates fs.lchmod and fs.lchmodSync (DEP0035: documentation-only since v0.4.7).",
  "inLanguage": "en",
  "dateModified": "2026-10-21",
  "keywords": [
    "deprecated",
    "nodejs",
    "low"
  ],
  "about": {
    "@type": "Thing",
    "name": "Fs.lchmod and fs.lchmodSync are deprecated",
    "identifier": "pkg:generic/nodejs"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Node.js deprecations: DEP0035",
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
