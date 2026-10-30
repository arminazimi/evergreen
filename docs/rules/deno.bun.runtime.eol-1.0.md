---
title: "Bun 1.0.x is end-of-life — dates, impact, migration"
description: "Bun 1.0.x was superseded by Bun 1.1.0 and is end-of-life."
canonical_url: "https://arminazimi.github.io/evergreen/rules/deno.bun.runtime.eol-1.0.html"
---

# Bun 1.0.x is end-of-life

**End of life** as of 2024-04-01. Replacement: Bun 1.1 or later. Source: [Bun 1.1.0 Release](https://github.com/oven-sh/bun/releases/tag/bun-v1.1.0).

Check a version:

```bash
evergreen check pkg:generic/bun
```

Bun 1.0.x was superseded by Bun 1.1.0 and is end-of-life.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `deno` |
| Component | `pkg:generic/bun` |
| Affected versions | `vers:semver/>=1.0.0\|<1.1.0` |
| Date from the source | 2024-04-01 |
| Replacement | Bun 1.1 or later |
| Evidence last seen | 2026-10-26 |
| Reviewed | 2026-10-26 by arminazimi |
| Review due | 2027-01-24 (90 days after the last review) |
| Rule ID | `deno.bun.runtime.eol-1.0` |

## Sources

- [Bun 1.1.0 Release](https://github.com/oven-sh/bun/releases/tag/bun-v1.1.0)

## Migration

**Constraints**

- Upgrade to Bun 1.1 or later.

**Steps**

1. **Upgrade Bun runtime.** Update the Bun version pin in bunfig.toml, .bun-version, or deno.json to Bun 1.1 or later.

**Verification**

- `bun --version`: Confirm active Bun runtime version.

## Detected by

The `deno` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/deno.json`](https://github.com/arminazimi/evergreen/blob/main/registry/deno.json), rule `deno.bun.runtime.eol-1.0`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/deno.bun.runtime.eol-1.0.html",
  "url": "https://arminazimi.github.io/evergreen/rules/deno.bun.runtime.eol-1.0.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/deno.bun.runtime.eol-1.0.html",
  "headline": "Bun 1.0.x is end-of-life — dates, impact, migration",
  "description": "Bun 1.0.x was superseded by Bun 1.1.0 and is end-of-life.",
  "inLanguage": "en",
  "dateModified": "2026-10-26",
  "keywords": [
    "end-of-life",
    "deno",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Bun 1.0.x is end-of-life",
    "identifier": "pkg:generic/bun"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Bun 1.1.0 Release",
      "url": "https://github.com/oven-sh/bun/releases/tag/bun-v1.1.0"
    }
  ],
  "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/deno.json",
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen"
  }
}
</script>
