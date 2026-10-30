---
title: "The customFds option of child_process has been removed — dates, impact, migration"
description: "Node.js removed the customFds option of child_process (DEP0006: documentation-only since v0.5.10, runtime deprecation since v0.11.14, end-of-life since v12.0.0)."
canonical_url: "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.child-process.customfds.html"
---

# The customFds option of child_process has been removed

**Removed.** The source gives no day. Replacement: options.stdio. Source: [Node.js deprecations: DEP0006](https://nodejs.org/api/deprecations.html).

Check a version:

```bash
evergreen check pkg:generic/nodejs
```

Node.js removed the customFds option of child_process (DEP0006: documentation-only since v0.5.10, runtime deprecation since v0.11.14, end-of-life since v12.0.0).

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Removed |
| Severity | high |
| Ecosystem | `nodejs` |
| Component | `pkg:generic/nodejs` |
| Affected versions | `vers:semver/>=12.0.0` |
| Date from the source | The source gives no day |
| Replacement | options.stdio |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-10-21 (365 days after the last review) |
| Rule ID | `nodejs.symbol.child-process.customfds` |

## Sources

- [Node.js deprecations: DEP0006](https://nodejs.org/api/deprecations.html)

## Migration

**Constraints**

- Keep the behavior of the code unchanged; check the replacement's argument and return-value differences.

**Steps**

1. **Replace the usage.** Replace each reported use of the customFds option of child_process with options.stdio.

**Verification**

- `npm run test --if-present`: Run the repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/nodejs.json`](https://github.com/arminazimi/evergreen/blob/main/registry/nodejs.json), rule `nodejs.symbol.child-process.customfds`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.child-process.customfds.html",
  "url": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.child-process.customfds.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.child-process.customfds.html",
  "headline": "The customFds option of child_process has been removed — dates, impact, migration",
  "description": "Node.js removed the customFds option of child_process (DEP0006: documentation-only since v0.5.10, runtime deprecation since v0.11.14, end-of-life since v12.0.0).",
  "inLanguage": "en",
  "dateModified": "2026-10-21",
  "keywords": [
    "removed",
    "nodejs",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "The customFds option of child_process has been removed",
    "identifier": "pkg:generic/nodejs"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Node.js deprecations: DEP0006",
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
