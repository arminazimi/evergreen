---
title: "headroom-cli was renamed and is no longer maintained — dates, impact, migration"
description: "The maintainer states that headroom-cli is no longer maintained and development continues as quotagauge."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.package.headroom-cli.eol.html"
---

# headroom-cli was renamed and is no longer maintained

The maintainer states that headroom-cli is no longer maintained and development continues as quotagauge.

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `python` |
| Component | `pkg:pypi/headroom-cli` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | quotagauge |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.headroom-cli.eol` |

## Sources

- [headroom-cli rename and migration notice](https://pypi.org/project/headroom-cli/)

## Migration

**Constraints**

- Preserve provider configuration, usage history, statusline and hook integration, CLI behavior, and the existing ~/.headroom state.

**Steps**

1. **Move to quotagauge.** Install quotagauge, run its initialization for configured providers, verify settings rewrites and state migration, then uninstall headroom-cli.

**Verification**

- `quotagauge init --all`: Initialize integrations and exercise the maintainer-provided state migration.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.headroom-cli.eol`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.package.headroom-cli.eol.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.package.headroom-cli.eol.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.headroom-cli.eol.html",
  "headline": "headroom-cli was renamed and is no longer maintained — dates, impact, migration",
  "description": "The maintainer states that headroom-cli is no longer maintained and development continues as quotagauge.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "end-of-life",
    "python",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "headroom-cli was renamed and is no longer maintained",
    "identifier": "pkg:pypi/headroom-cli"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "headroom-cli rename and migration notice",
      "url": "https://pypi.org/project/headroom-cli/"
    }
  ],
  "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/python.json",
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen"
  }
}
</script>
