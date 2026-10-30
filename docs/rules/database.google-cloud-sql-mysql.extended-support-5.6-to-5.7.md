---
title: "Cloud SQL for MySQL 5.6 and 5.7 are in extended support — dates, impact, migration"
description: "The Cloud SQL for MySQL version policy lists MySQL 5.6 and 5.7 with extended support starting 2025-02-01 and deprecation on 2028-02-01."
canonical_url: "https://arminazimi.github.io/evergreen/rules/database.google-cloud-sql-mysql.extended-support-5.6-to-5.7.html"
json_twin: "/rules/database.google-cloud-sql-mysql.extended-support-5.6-to-5.7.json"
---

# Cloud SQL for MySQL 5.6 and 5.7 are in extended support

**End of support** as of 2025-02-01. Replacement: MySQL 8.0 or later. Source: [Cloud SQL for MySQL database versions and version policies](https://cloud.google.com/sql/docs/mysql/db-versions).

Check a version:

```bash
evergreen check pkg:generic/google-cloud-sql-mysql
```

The Cloud SQL for MySQL version policy lists MySQL 5.6 and 5.7 with extended support starting 2025-02-01 and deprecation on 2028-02-01. Oracle no longer supports those release series, and Cloud SQL charges for extended support.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `database` |
| Component | `pkg:generic/google-cloud-sql-mysql` |
| Affected versions | `vers:semver/>=5.6.0\|<5.8.0` |
| Date from the source | 2025-02-01 |
| Replacement | MySQL 8.0 or later |
| Evidence last seen | 2026-10-26 |
| Reviewed | 2026-10-26 by arminazimi |
| Review due | 2027-01-24 (90 days after the last review) |
| Rule ID | `database.google-cloud-sql-mysql.extended-support-5.6-to-5.7` |

## Sources

- [Cloud SQL for MySQL database versions and version policies](https://cloud.google.com/sql/docs/mysql/db-versions) (accessed 2026-10-26)
- [MySQL supported platforms and lifecycle](https://www.mysql.com/support/supportedplatforms/database.html) (accessed 2026-10-26)
- [endoflife.date: MySQL](https://endoflife.date/mysql) (accessed 2026-10-26)

## Migration

**Constraints**

- Cloud SQL moves an instance to extended support when the MySQL community reaches end of life. Extended support is time-boxed to three years and is charged.
- Changing database_version can upgrade the instance in place or recreate it, depending on the target. Read the plan before applying and take a backup first.
- A major version upgrade cannot be reversed by changing database_version back; restore the backup instead.

**Steps**

1. **Back up the instance.** Take an on-demand backup of every Cloud SQL for MySQL instance reported, before changing its major version.
2. **Upgrade the instance.** Upgrade the instance to MySQL 8.0 or later with Cloud SQL's in-place major version upgrade, or restore the backup into a new instance on the replacement major and move the application connection string.
3. **Raise the declared version.** Change database_version in every google_sql_database_instance and google_sql_source_representation_instance block that runs this database, using the MYSQL_ prefix for the replacement major.
4. **Check clients and authentication.** Update MySQL drivers, ORMs, and users that rely on mysql_native_password; MySQL 8.4 uses caching_sha2_password by default.

**Verification**

- `terraform validate`: Check that the Terraform configuration is valid with the new database_version.
- `terraform plan`: Review the plan and confirm the database_version change is intended and is the only instance change.
- `gcloud sql instances list --format="table(name,databaseVersion)"`: Confirm each reported instance now reports a supported MySQL database version.
- `docker compose config`: Confirm any local Compose service that mirrors this database is valid and uses a MySQL image tag that matches the replacement.

## Detected by

The `database` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/database.json`](https://github.com/arminazimi/evergreen/blob/main/registry/database.json), rule `database.google-cloud-sql-mysql.extended-support-5.6-to-5.7`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/database.google-cloud-sql-mysql.extended-support-5.6-to-5.7.html",
  "url": "https://arminazimi.github.io/evergreen/rules/database.google-cloud-sql-mysql.extended-support-5.6-to-5.7.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/database.google-cloud-sql-mysql.extended-support-5.6-to-5.7.html",
  "headline": "Cloud SQL for MySQL 5.6 and 5.7 are in extended support — dates, impact, migration",
  "description": "The Cloud SQL for MySQL version policy lists MySQL 5.6 and 5.7 with extended support starting 2025-02-01 and deprecation on 2028-02-01.",
  "inLanguage": "en",
  "dateModified": "2026-10-26",
  "keywords": [
    "end-of-support",
    "database",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Cloud SQL for MySQL 5.6 and 5.7 are in extended support",
    "identifier": "pkg:generic/google-cloud-sql-mysql"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Cloud SQL for MySQL database versions and version policies",
      "url": "https://cloud.google.com/sql/docs/mysql/db-versions"
    },
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
