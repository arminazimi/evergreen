---
title: "Azure Database for PostgreSQL 11, 12, and 13 are past standard support — dates, impact, migration"
description: "The Azure Database for PostgreSQL version policy lists 2026-07-31 as the standard support end date for PostgreSQL 11, 12, and 13."
canonical_url: "https://arminazimi.github.io/evergreen/rules/database.azure-postgresql.standard-support-ended-11-to-13.html"
---

# Azure Database for PostgreSQL 11, 12, and 13 are past standard support

**End of support** as of 2026-07-31. Replacement: PostgreSQL 14 or later. Source: [Azure Database for PostgreSQL version policy](https://learn.microsoft.com/azure/postgresql/flexible-server/concepts-version-policy).

Check a version:

```bash
evergreen check pkg:generic/azure-database-postgresql
```

The Azure Database for PostgreSQL version policy lists 2026-07-31 as the standard support end date for PostgreSQL 11, 12, and 13. After that date Azure offers only time-boxed Extended Support, and it does not allow new servers on those major versions.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `database` |
| Component | `pkg:generic/azure-database-postgresql` |
| Affected versions | `vers:semver/>=11.0.0\|<14.0.0` |
| Date from the source | 2026-07-31 |
| Replacement | PostgreSQL 14 or later |
| Evidence last seen | 2026-10-26 |
| Reviewed | 2026-10-26 by arminazimi |
| Review due | 2027-01-24 (90 days after the last review) |
| Rule ID | `database.azure-postgresql.standard-support-ended-11-to-13` |

## Sources

- [Azure Database for PostgreSQL version policy](https://learn.microsoft.com/azure/postgresql/flexible-server/concepts-version-policy) (accessed 2026-10-26)
- [PostgreSQL versioning policy](https://www.postgresql.org/support/versioning/) (accessed 2026-10-26)

## Migration

**Constraints**

- The version argument on azurerm_postgresql_flexible_server and azurerm_postgresql_server names the major version; changing it alone does not move an existing server or its data.
- Azure applies a major version upgrade through its managed upgrade operation. Take a backup or point-in-time restore point first, and do not treat changing version back as a rollback.
- Azure Extended Support keeps the server running after the standard support end date, but it is time-boxed and does not replace moving to a supported major.

**Steps**

1. **Back up the server.** Take a verified backup or point-in-time restore point of every Azure Database for PostgreSQL server reported, before changing its major version.
2. **Upgrade the server to a supported major.** Upgrade the server to PostgreSQL 14 or later with Azure's major version upgrade, or restore the backup into a new flexible server on the replacement major and move the application connection string to it.
3. **Raise the declared version.** Change version in every azurerm_postgresql_flexible_server and azurerm_postgresql_server block that runs this database, not only the reported line.
4. **Check clients and extensions.** Update PostgreSQL drivers, ORMs, extensions, and Azure networking or identity settings that assume the old major version.

**Verification**

- `terraform validate`: Check that the Terraform configuration is valid with the new version argument.
- `terraform plan`: Review the plan and confirm the version change is intended and is the only server change.
- `az postgres flexible-server list --query "[].{name:name, version:version}"`: Confirm each reported flexible server now reports a supported PostgreSQL major version.
- `docker compose config`: Confirm any local Compose service that mirrors this database is valid and uses a PostgreSQL image tag that matches the replacement.

## Detected by

The `database` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/database.json`](https://github.com/arminazimi/evergreen/blob/main/registry/database.json), rule `database.azure-postgresql.standard-support-ended-11-to-13`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/database.azure-postgresql.standard-support-ended-11-to-13.html",
  "url": "https://arminazimi.github.io/evergreen/rules/database.azure-postgresql.standard-support-ended-11-to-13.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/database.azure-postgresql.standard-support-ended-11-to-13.html",
  "headline": "Azure Database for PostgreSQL 11, 12, and 13 are past standard support — dates, impact, migration",
  "description": "The Azure Database for PostgreSQL version policy lists 2026-07-31 as the standard support end date for PostgreSQL 11, 12, and 13.",
  "inLanguage": "en",
  "dateModified": "2026-10-26",
  "keywords": [
    "end-of-support",
    "database",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Azure Database for PostgreSQL 11, 12, and 13 are past standard support",
    "identifier": "pkg:generic/azure-database-postgresql"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Azure Database for PostgreSQL version policy",
      "url": "https://learn.microsoft.com/azure/postgresql/flexible-server/concepts-version-policy"
    },
    {
      "@type": "CreativeWork",
      "name": "PostgreSQL versioning policy",
      "url": "https://www.postgresql.org/support/versioning/"
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
