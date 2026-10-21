---
title: "The recursive option of fs.rmdir has been removed — dates, impact, migration"
description: "Node.js removed the recursive option of fs.rmdir() and fs.rmdirSync() (DEP0147: documentation-only since v14.14.0, runtime since v16.0.0, end-of-life since v25.0.0)."
canonical_url: "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.fs.rmdir-recursive.html"
---

# The recursive option of fs.rmdir has been removed

Node.js removed the recursive option of fs.rmdir() and fs.rmdirSync() (DEP0147: documentation-only since v14.14.0, runtime since v16.0.0, end-of-life since v25.0.0).

| | |
| --- | --- |
| Status | Removed |
| Severity | high |
| Ecosystem | `nodejs` |
| Component | `pkg:generic/nodejs` |
| Affected versions | `vers:semver/>=25.0.0` |
| Date from the source | The source gives no day |
| Replacement | fs.rm(path, { recursive: true, force: true }) |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-10-21 (365 days after the last review) |
| Rule ID | `nodejs.symbol.fs.rmdir-recursive` |

## Sources

- [Node.js deprecations: DEP0147 fs.rmdir recursive](https://nodejs.org/api/deprecations.html)

## Migration

**Constraints**

- Keep the behavior of the call unchanged; check the replacement's argument and error handling differences.

**Steps**

1. **Use fs.rm.** Replace fs.rmdir(path, { recursive: true }) with fs.rm(path, { recursive: true, force: true }), and the sync form with fs.rmSync.

**Verification**

- `npm run test --if-present`: Run the repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/nodejs.json`](https://github.com/arminazimi/evergreen/blob/main/registry/nodejs.json), rule `nodejs.symbol.fs.rmdir-recursive`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.fs.rmdir-recursive.html",
  "url": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.fs.rmdir-recursive.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.fs.rmdir-recursive.html",
  "headline": "The recursive option of fs.rmdir has been removed — dates, impact, migration",
  "description": "Node.js removed the recursive option of fs.rmdir() and fs.rmdirSync() (DEP0147: documentation-only since v14.14.0, runtime since v16.0.0, end-of-life since v25.0.0).",
  "inLanguage": "en",
  "dateModified": "2026-10-21",
  "keywords": [
    "removed",
    "nodejs",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "The recursive option of fs.rmdir has been removed",
    "identifier": "pkg:generic/nodejs"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Node.js deprecations: DEP0147 fs.rmdir recursive",
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
