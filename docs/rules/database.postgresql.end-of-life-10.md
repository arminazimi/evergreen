---
title: "PostgreSQL 10 is no longer a supported major version — dates, impact, migration"
description: "The PostgreSQL Global Development Group lists 10 as unsupported: its final release was on 2022-11-10, so it receives no further bug or security fixes."
canonical_url: "https://arminazimi.github.io/evergreen/rules/database.postgresql.end-of-life-10.html"
json_twin: "/rules/database.postgresql.end-of-life-10.json"
---

# PostgreSQL 10 is no longer a supported major version

**End of life** as of 2022-11-10. Replacement: PostgreSQL 15 or later. Source: [PostgreSQL versioning policy](https://www.postgresql.org/support/versioning/).

Check a version:

```bash
evergreen check pkg:generic/postgresql
```

The PostgreSQL Global Development Group lists 10 as unsupported: its final release was on 2022-11-10, so it receives no further bug or security fixes.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `database` |
| Component | `pkg:generic/postgresql` |
| Affected versions | `vers:semver/>=10.0.0\|<11.0.0` |
| Date from the source | 2022-11-10 |
| Replacement | PostgreSQL 15 or later |
| Evidence last seen | 2026-10-29 |
| Reviewed | 2026-10-29 by arminazimi |
| Review due | 2027-01-27 (90 days after the last review) |
| Rule ID | `database.postgresql.end-of-life-10` |

## Sources

- [PostgreSQL versioning policy](https://www.postgresql.org/support/versioning/)

## Migration

**Constraints**

- A PostgreSQL data directory written by one major version cannot be started by another. Changing the image tag of a service that has a volume will fail or, worse, start with an empty database.
- Upgrade with pg_upgrade or a dump and restore (pg_dumpall, then psql), and move to a supported major in one planned change instead of one major at a time unless the tool you use requires it.
- For managed databases, engine_version changes do not apply major upgrades unless allow_major_version_upgrade is set; plan the maintenance window before applying.

**Steps**

1. **Back up the data first.** Take a verified backup or snapshot of every PostgreSQL instance in the reported files before changing any version. A major version change is not reversible by changing the version back.
2. **Upgrade the database cluster.** Run the upgrade with pg_upgrade or restore a dump into a new instance on the target major version. On a managed database, upgrade through a snapshot restore or a reviewed engine_version change with allow_major_version_upgrade.
3. **Raise the declared version.** Change the image tag in Compose files, or engine_version in Terraform, to the release in the replacement. Do this in every file and environment that runs this database, not only the reported line.
4. **Check clients and tooling.** Update drivers, ORMs, CI service containers, and local setup documentation that assume the old PostgreSQL version.

**Verification**

- `docker compose config`: Confirm the Compose file is valid and shows the intended PostgreSQL image tag after the change.
- `terraform validate`: Check that the Terraform configuration is valid with the new engine_version.
- `terraform plan`: Review the plan and confirm the engine_version change is the only database change, and that it is intended.

## Detected by

The `database` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Other versions of this product

- [PostgreSQL 11 is no longer a supported major version](database.postgresql.end-of-life-11.html)
- [PostgreSQL 12 is no longer a supported major version](database.postgresql.end-of-life-12.html)
- [PostgreSQL 13 is no longer a supported major version](database.postgresql.end-of-life-13.html)
- [PostgreSQL 14 reaches the end of its support on 2026-11-12](database.postgresql.end-of-life-14.html)

### Same ecosystem

- [Azure Database for MySQL 5.7 is past standard support](database.azure-mysql.standard-support-ended-5.7.html)
- [Azure Database for PostgreSQL 11, 12, and 13 are past standard support](database.azure-postgresql.standard-support-ended-11-to-13.html)
- [Cloud SQL for MySQL 5.6 and 5.7 are in extended support](database.google-cloud-sql-mysql.extended-support-5.6-to-5.7.html)
- [Cloud SQL for PostgreSQL 13 is in extended support](database.google-cloud-sql-postgresql.extended-support-13.html)
- [Cloud SQL for PostgreSQL 9.6 through 12 are in extended support](database.google-cloud-sql-postgresql.extended-support-9.6-to-12.html)
- [MySQL 5.7 is end-of-life](database.mysql.end-of-life-5.7.html)
- [MySQL 8.0 is end-of-life](database.mysql.end-of-life-8.0.html)
- [Redis 7.0 is end-of-life](database.redis.end-of-life-7.0.html)


## Data

This page is generated from [`registry/database.json`](https://github.com/arminazimi/evergreen/blob/main/registry/database.json), rule `database.postgresql.end-of-life-10`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/database.postgresql.end-of-life-10.html",
      "url": "https://arminazimi.github.io/evergreen/rules/database.postgresql.end-of-life-10.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/database.postgresql.end-of-life-10.html",
      "headline": "PostgreSQL 10 is no longer a supported major version — dates, impact, migration",
      "description": "The PostgreSQL Global Development Group lists 10 as unsupported: its final release was on 2022-11-10, so it receives no further bug or security fixes.",
      "inLanguage": "en",
      "dateModified": "2026-10-29",
      "keywords": [
        "end-of-life",
        "database",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "PostgreSQL 10 is no longer a supported major version",
        "identifier": "pkg:generic/postgresql"
      },
      "citation": [
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
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/database.postgresql.end-of-life-10.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/database.postgresql.end-of-life-10.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/postgresql?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life as of 2022-11-10. Affected versions: vers:semver/>=10.0.0|\u003c11.0.0. Source: PostgreSQL versioning policy (https://www.postgresql.org/support/versioning/)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/postgresql?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "PostgreSQL 15 or later"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/postgresql?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/postgresql."
          }
        }
      ]
    }
  ]
}
</script>
