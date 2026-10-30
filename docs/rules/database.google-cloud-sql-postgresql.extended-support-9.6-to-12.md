---
title: "Cloud SQL for PostgreSQL 9.6 through 12 are in extended support — dates, impact, migration"
description: "The Cloud SQL for PostgreSQL version policy lists PostgreSQL 9.6, 10, 11, and 12 with extended support starting 2025-02-01 and deprecation on 2028-02-01."
canonical_url: "https://arminazimi.github.io/evergreen/rules/database.google-cloud-sql-postgresql.extended-support-9.6-to-12.html"
json_twin: "/rules/database.google-cloud-sql-postgresql.extended-support-9.6-to-12.json"
---

# Cloud SQL for PostgreSQL 9.6 through 12 are in extended support

**End of support** as of 2025-02-01. Replacement: PostgreSQL 14 or later. Source: [Cloud SQL for PostgreSQL database versions and version policies](https://cloud.google.com/sql/docs/postgres/db-versions).

Check a version:

```bash
evergreen check pkg:generic/google-cloud-sql-postgresql
```

The Cloud SQL for PostgreSQL version policy lists PostgreSQL 9.6, 10, 11, and 12 with extended support starting 2025-02-01 and deprecation on 2028-02-01. The PostgreSQL community no longer supports those majors, and Cloud SQL charges for extended support.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `database` |
| Component | `pkg:generic/google-cloud-sql-postgresql` |
| Affected versions | `vers:semver/>=9.6.0\|<13.0.0` |
| Date from the source | 2025-02-01 |
| Replacement | PostgreSQL 14 or later |
| Evidence last seen | 2026-10-26 |
| Reviewed | 2026-10-26 by arminazimi |
| Review due | 2027-01-24 (90 days after the last review) |
| Rule ID | `database.google-cloud-sql-postgresql.extended-support-9.6-to-12` |

## Sources

- [Cloud SQL for PostgreSQL database versions and version policies](https://cloud.google.com/sql/docs/postgres/db-versions) (accessed 2026-10-26)
- [PostgreSQL versioning policy](https://www.postgresql.org/support/versioning/) (accessed 2026-10-26)

## Migration

**Constraints**

- Cloud SQL moves an instance to extended support when the PostgreSQL community reaches end of life. Extended support is time-boxed to three years and is charged from 2025-05-01.
- Changing database_version can upgrade the instance in place or recreate it, depending on the target. Read the plan before applying and take a backup first.
- A major version upgrade cannot be reversed by changing database_version back; restore the backup instead.

**Steps**

1. **Back up the instance.** Take an on-demand backup of every Cloud SQL for PostgreSQL instance reported, before changing its major version.
2. **Upgrade the instance.** Upgrade the instance to PostgreSQL 14 or later with Cloud SQL's in-place major version upgrade, or restore the backup into a new instance on the replacement major and move the application connection string.
3. **Raise the declared version.** Change database_version in every google_sql_database_instance and google_sql_source_representation_instance block that runs this database, using the POSTGRES_ prefix for the replacement major.
4. **Check clients and extensions.** Update PostgreSQL drivers, ORMs, extensions, and any maintenance or backup automation that names the old major version.

**Verification**

- `terraform validate`: Check that the Terraform configuration is valid with the new database_version.
- `terraform plan`: Review the plan and confirm the database_version change is intended and is the only instance change.
- `gcloud sql instances list --format="table(name,databaseVersion)"`: Confirm each reported instance now reports a supported PostgreSQL database version.
- `docker compose config`: Confirm any local Compose service that mirrors this database is valid and uses a PostgreSQL image tag that matches the replacement.

## Detected by

The `database` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Other versions of this product

- [Cloud SQL for PostgreSQL 13 is in extended support](database.google-cloud-sql-postgresql.extended-support-13.html)

### Same ecosystem

- [Azure Database for MySQL 5.7 is past standard support](database.azure-mysql.standard-support-ended-5.7.html)
- [Azure Database for PostgreSQL 11, 12, and 13 are past standard support](database.azure-postgresql.standard-support-ended-11-to-13.html)
- [Cloud SQL for MySQL 5.6 and 5.7 are in extended support](database.google-cloud-sql-mysql.extended-support-5.6-to-5.7.html)
- [MySQL 5.7 is end-of-life](database.mysql.end-of-life-5.7.html)
- [MySQL 8.0 is end-of-life](database.mysql.end-of-life-8.0.html)
- [PostgreSQL 10 is no longer a supported major version](database.postgresql.end-of-life-10.html)
- [PostgreSQL 11 is no longer a supported major version](database.postgresql.end-of-life-11.html)
- [PostgreSQL 12 is no longer a supported major version](database.postgresql.end-of-life-12.html)


## Data

This page is generated from [`registry/database.json`](https://github.com/arminazimi/evergreen/blob/main/registry/database.json), rule `database.google-cloud-sql-postgresql.extended-support-9.6-to-12`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/database.google-cloud-sql-postgresql.extended-support-9.6-to-12.html",
      "url": "https://arminazimi.github.io/evergreen/rules/database.google-cloud-sql-postgresql.extended-support-9.6-to-12.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/database.google-cloud-sql-postgresql.extended-support-9.6-to-12.html",
      "headline": "Cloud SQL for PostgreSQL 9.6 through 12 are in extended support — dates, impact, migration",
      "description": "The Cloud SQL for PostgreSQL version policy lists PostgreSQL 9.6, 10, 11, and 12 with extended support starting 2025-02-01 and deprecation on 2028-02-01.",
      "inLanguage": "en",
      "dateModified": "2026-10-26",
      "keywords": [
        "end-of-support",
        "database",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "Cloud SQL for PostgreSQL 9.6 through 12 are in extended support",
        "identifier": "pkg:generic/google-cloud-sql-postgresql"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Cloud SQL for PostgreSQL database versions and version policies",
          "url": "https://cloud.google.com/sql/docs/postgres/db-versions"
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
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/database.google-cloud-sql-postgresql.extended-support-9.6-to-12.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/database.google-cloud-sql-postgresql.extended-support-9.6-to-12.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/google-cloud-sql-postgresql?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of support as of 2025-02-01. Affected versions: vers:semver/>=9.6.0|\u003c13.0.0. Source: Cloud SQL for PostgreSQL database versions and version policies (https://cloud.google.com/sql/docs/postgres/db-versions)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/google-cloud-sql-postgresql?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "PostgreSQL 14 or later"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/google-cloud-sql-postgresql?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/google-cloud-sql-postgresql."
          }
        }
      ]
    }
  ]
}
</script>
