---
title: "PostgreSQL 11 is no longer a supported major version — dates, impact, migration"
description: "The PostgreSQL Global Development Group lists 11 as unsupported: its final release was on November 9, 2023, so it receives no further bug or security fixes."
canonical_url: "https://arminazimi.github.io/evergreen/rules/database.postgresql.end-of-life-11.html"
---

# PostgreSQL 11 is no longer a supported major version

The PostgreSQL Global Development Group lists 11 as unsupported: its final release was on November 9, 2023, so it receives no further bug or security fixes. A database image tag or managed engine_version on this line runs unsupported software.

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `database` |
| Component | `pkg:generic/postgresql` |
| Affected versions | `vers:semver/>=11.0.0\|<12.0.0` |
| Date from the source | 2023-11-09 |
| Replacement | PostgreSQL 16 or later |
| Evidence last seen | 2026-10-22 |
| Reviewed | 2026-10-22 by arminazimi |
| Review due | 2027-01-20 (90 days after the last review) |
| Rule ID | `database.postgresql.end-of-life-11` |

## Sources

- [PostgreSQL versioning policy](https://www.postgresql.org/support/versioning/)
- [endoflife.date: PostgreSQL](https://endoflife.date/postgresql)

## Detected by

No built-in detector reads `database` declarations yet; the rule is data in the [lifecycle registry](https://github.com/arminazimi/evergreen/blob/main/registry/database.json).

## Data

This page is generated from [`registry/database.json`](https://github.com/arminazimi/evergreen/blob/main/registry/database.json), rule `database.postgresql.end-of-life-11`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/database.postgresql.end-of-life-11.html",
  "url": "https://arminazimi.github.io/evergreen/rules/database.postgresql.end-of-life-11.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/database.postgresql.end-of-life-11.html",
  "headline": "PostgreSQL 11 is no longer a supported major version — dates, impact, migration",
  "description": "The PostgreSQL Global Development Group lists 11 as unsupported: its final release was on November 9, 2023, so it receives no further bug or security fixes.",
  "inLanguage": "en",
  "dateModified": "2026-10-22",
  "keywords": [
    "end-of-life",
    "database",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "PostgreSQL 11 is no longer a supported major version",
    "identifier": "pkg:generic/postgresql"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "PostgreSQL versioning policy",
      "url": "https://www.postgresql.org/support/versioning/"
    },
    {
      "@type": "CreativeWork",
      "name": "endoflife.date: PostgreSQL",
      "url": "https://endoflife.date/postgresql"
    }
  ],
  "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/database.json",
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen"
  }
}
</script>
