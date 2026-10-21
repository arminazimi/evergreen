---
title: "MySQL 8.0 is end-of-life — dates, impact, migration"
description: "MySQL 8.0 reached end of life on 2026-04-30 and no longer receives security or bug fixes from Oracle."
canonical_url: "https://arminazimi.github.io/evergreen/rules/database.mysql.end-of-life-8.0.html"
---

# MySQL 8.0 is end-of-life

MySQL 8.0 reached end of life on 2026-04-30 and no longer receives security or bug fixes from Oracle. The mysql.com lifecycle page could not be read when this rule was reviewed (it refuses automated requests), so the date is taken from the endoflife.date record for MySQL.

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `database` |
| Component | `pkg:generic/mysql` |
| Affected versions | `vers:semver/>=8.0.0\|<8.1.0` |
| Date from the source | 2026-04-30 |
| Replacement | MySQL 8.4 LTS or later |
| Evidence last seen | 2026-10-22 |
| Reviewed | 2026-10-22 by arminazimi |
| Review due | 2027-01-20 (90 days after the last review) |
| Rule ID | `database.mysql.end-of-life-8.0` |

## Sources

- [MySQL supported platforms and lifecycle](https://www.mysql.com/support/supportedplatforms/database.html)
- [endoflife.date: MySQL](https://endoflife.date/mysql)

## Detected by

The `database` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/database.json`](https://github.com/arminazimi/evergreen/blob/main/registry/database.json), rule `database.mysql.end-of-life-8.0`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/database.mysql.end-of-life-8.0.html",
  "url": "https://arminazimi.github.io/evergreen/rules/database.mysql.end-of-life-8.0.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/database.mysql.end-of-life-8.0.html",
  "headline": "MySQL 8.0 is end-of-life — dates, impact, migration",
  "description": "MySQL 8.0 reached end of life on 2026-04-30 and no longer receives security or bug fixes from Oracle.",
  "inLanguage": "en",
  "dateModified": "2026-10-22",
  "keywords": [
    "end-of-life",
    "database",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "MySQL 8.0 is end-of-life",
    "identifier": "pkg:generic/mysql"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "MySQL supported platforms and lifecycle",
      "url": "https://www.mysql.com/support/supportedplatforms/database.html"
    },
    {
      "@type": "CreativeWork",
      "name": "endoflife.date: MySQL",
      "url": "https://endoflife.date/mysql"
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
