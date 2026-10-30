---
title: "Azure Database for MySQL 5.7 is past standard support — dates, impact, migration"
description: "The Azure Database for MySQL version support policy lists 2026-09-30 as the standard support end date for MySQL 5.7."
canonical_url: "https://arminazimi.github.io/evergreen/rules/database.azure-mysql.standard-support-ended-5.7.html"
json_twin: "/rules/database.azure-mysql.standard-support-ended-5.7.json"
---

# Azure Database for MySQL 5.7 is past standard support

**End of support** as of 2026-09-30. Replacement: MySQL 8.0 or later. Source: [Azure Database for MySQL version support policy](https://learn.microsoft.com/azure/mysql/flexible-server/concepts-supported-versions).

Check a version:

```bash
evergreen check pkg:generic/azure-database-mysql
```

The Azure Database for MySQL version support policy lists 2026-09-30 as the standard support end date for MySQL 5.7. Azure moves the server to paid Extended Support on 2026-10-01; the MySQL community retired 5.7 on 2023-10-31.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `database` |
| Component | `pkg:generic/azure-database-mysql` |
| Affected versions | `vers:semver/>=5.7.0\|<5.8.0` |
| Date from the source | 2026-09-30 |
| Replacement | MySQL 8.0 or later |
| Evidence last seen | 2026-10-26 |
| Reviewed | 2026-10-26 by arminazimi |
| Review due | 2027-01-24 (90 days after the last review) |
| Rule ID | `database.azure-mysql.standard-support-ended-5.7` |

## Sources

- [Azure Database for MySQL version support policy](https://learn.microsoft.com/azure/mysql/flexible-server/concepts-supported-versions) (accessed 2026-10-26)
- [MySQL supported platforms and lifecycle](https://www.mysql.com/support/supportedplatforms/database.html) (accessed 2026-10-26)
- [endoflife.date: MySQL](https://endoflife.date/mysql) (accessed 2026-10-26)

## Migration

**Constraints**

- The version argument on azurerm_mysql_flexible_server and azurerm_mysql_server names the major version; changing it alone does not upgrade an existing server or its data.
- Upgrade through Azure's managed operation or restore into a new server on the replacement version. A failed upgrade is not reversed by changing version back.
- Azure Extended Support keeps MySQL 5.7 running after the standard support end date, but it is time-boxed and may be charged.

**Steps**

1. **Back up the server.** Take a verified backup or point-in-time restore point of every Azure Database for MySQL server reported, before changing its version.
2. **Upgrade the server to a supported version.** Upgrade the server to MySQL 8.0 or later through Azure's managed upgrade, or restore the backup into a new flexible server on the replacement version and move the application connection string.
3. **Raise the declared version.** Change version in every azurerm_mysql_flexible_server and azurerm_mysql_server block that runs this database, not only the reported line.
4. **Check clients and authentication.** Update MySQL drivers, ORMs, and users that rely on mysql_native_password; MySQL 8.4 uses caching_sha2_password by default.

**Verification**

- `terraform validate`: Check that the Terraform configuration is valid with the new version argument.
- `terraform plan`: Review the plan and confirm the version change is intended and is the only server change.
- `az mysql flexible-server list --query "[].{name:name, version:version}"`: Confirm each reported flexible server now reports a supported MySQL version.
- `docker compose config`: Confirm any local Compose service that mirrors this database is valid and uses a MySQL image tag that matches the replacement.

## Detected by

The `database` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/database.json`](https://github.com/arminazimi/evergreen/blob/main/registry/database.json), rule `database.azure-mysql.standard-support-ended-5.7`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/database.azure-mysql.standard-support-ended-5.7.html",
  "url": "https://arminazimi.github.io/evergreen/rules/database.azure-mysql.standard-support-ended-5.7.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/database.azure-mysql.standard-support-ended-5.7.html",
  "headline": "Azure Database for MySQL 5.7 is past standard support — dates, impact, migration",
  "description": "The Azure Database for MySQL version support policy lists 2026-09-30 as the standard support end date for MySQL 5.7.",
  "inLanguage": "en",
  "dateModified": "2026-10-26",
  "keywords": [
    "end-of-support",
    "database",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Azure Database for MySQL 5.7 is past standard support",
    "identifier": "pkg:generic/azure-database-mysql"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Azure Database for MySQL version support policy",
      "url": "https://learn.microsoft.com/azure/mysql/flexible-server/concepts-supported-versions"
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
