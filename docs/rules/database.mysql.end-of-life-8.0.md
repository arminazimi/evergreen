---
title: "MySQL 8.0 is end-of-life — dates, impact, migration"
description: "MySQL 8.0 reached end of life on 2026-04-30 and no longer receives security or bug fixes from Oracle."
canonical_url: "https://arminazimi.github.io/evergreen/rules/database.mysql.end-of-life-8.0.html"
---

# MySQL 8.0 is end-of-life

MySQL 8.0 reached end of life on 2026-04-30 and no longer receives security or bug fixes from Oracle. The mysql.com lifecycle page could not be read when this rule was reviewed (it refuses automated requests), so the date is taken from the endoflife.date record for MySQL.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

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

## Migration

**Constraints**

- MySQL does not support skipping major release lines on upgrade. MySQL 5.7 must move to 8.0 before 8.4; 8.0 can move to 8.4 in place.
- A MySQL data directory is upgraded by the new server on first start and cannot be started by the old version again, so a backup is the only way back.
- For managed databases, engine_version changes do not apply major upgrades unless allow_major_version_upgrade is set; plan the maintenance window before applying.

**Steps**

1. **Back up the data first.** Take a verified backup or snapshot of every MySQL instance in the reported files before changing any version. A major version change is not reversible by changing the version back.
2. **Upgrade the database server.** Run mysqlcheck or the MySQL Shell upgrade checker against the old server, fix what it reports, then start the target version on the same data directory, or restore a logical dump into a new instance. On a managed database, upgrade through a snapshot restore or a reviewed engine_version change with allow_major_version_upgrade.
3. **Raise the declared version.** Change the image tag in Compose files, or engine_version in Terraform, to the release in the replacement. Do this in every file and environment that runs this database, not only the reported line.
4. **Check clients and tooling.** Update drivers, ORMs, CI service containers, and local setup documentation that assume the old MySQL version.

**Verification**

- `docker compose config`: Confirm the Compose file is valid and shows the intended MySQL image tag after the change.
- `terraform validate`: Check that the Terraform configuration is valid with the new engine_version.
- `terraform plan`: Review the plan and confirm the engine_version change is the only database change, and that it is intended.

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
