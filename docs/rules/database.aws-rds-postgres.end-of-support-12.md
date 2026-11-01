---
title: "RDS for PostgreSQL 12 is past end of standard support — dates, impact, migration"
description: "AWS ended standard support for RDS for PostgreSQL 12 on 2025-02-28. RDS Extended Support may keep it running for a fee through 2028-02-29. Upgrade to PostgreSQL 15 or later."
layout: doc
permalink: "/rules/database.aws-rds-postgres.end-of-support-12.html"
canonical_url: "https://arminazimi.github.io/evergreen/rules/database.aws-rds-postgres.end-of-support-12.html"
image: "/assets/og/database.aws-rds-postgres.end-of-support-12.svg"
review_date: "2026-10-30"
last_modified_at: "2026-10-30"
json_twin: "/rules/database.aws-rds-postgres.end-of-support-12.json"
---

# RDS for PostgreSQL 12 is past end of standard support

**End of support** as of 2025-02-28. Replacement: PostgreSQL 15 or later. Source: [Release calendars for Amazon RDS for PostgreSQL](https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-release-calendar.html).

Check a version:

```bash
evergreen check pkg:generic/aws-rds/postgres
```

AWS ended standard support for RDS for PostgreSQL 12 on 2025-02-28. RDS Extended Support may keep it running for a fee through 2028-02-29. Upgrade to PostgreSQL 15 or later.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `database` |
| Component | `pkg:generic/aws-rds/postgres` |
| Affected versions | `vers:intdot/>=12\|<13` |
| Date from the source | 2025-02-28 |
| Replacement | PostgreSQL 15 or later |
| Evidence last seen | 2026-10-30 |
| Reviewed | 2026-10-30 by arminazimi, drafted by the `aws-rds` importer |
| Review due | 2027-01-28 (90 days after the last review) |
| Rule ID | `database.aws-rds-postgres.end-of-support-12` |

## Sources

- [Release calendars for Amazon RDS for PostgreSQL](https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-release-calendar.html)
- [Using Amazon RDS Extended Support](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/extended-support.html)

## Migration

**Constraints**

- A major version upgrade on RDS or Aurora is a separate maintenance action; RDS does not apply it automatically, and changing the engine version back is not a rollback.
- Take a snapshot before a major version upgrade: the change cannot be undone in place.
- Extended Support keeps the instance or cluster running past the end of standard support for a fee; it does not replace moving to a supported major.

**Steps**

1. **Take a snapshot.** Take a manual RDS snapshot of every reported instance or cluster and verify that it can be restored.
2. **Upgrade to a supported major.** Upgrade with ModifyDBInstance or ModifyDBCluster and AllowMajorVersionUpgrade, or restore the snapshot into a new instance or cluster on PostgreSQL 15 or later and move the application connection string to it.
3. **Raise the declared version.** Change engine_version in every aws_db_instance, aws_rds_cluster, Compose, and Helm value that runs this database, not only the reported object.
4. **Check clients and extensions.** Update database drivers, ORMs, extensions, and parameter groups that assume the old major version.

**Verification**

- `terraform plan`: Review the plan and confirm the engine_version change is intended and is the only database change.
- `docker compose config`: Confirm any local Compose service that mirrors this database is valid and uses an image tag that matches PostgreSQL 15 or later.
- `aws rds describe-db-instances --query "DBInstances[?Engine=='postgres'].[DBInstanceIdentifier,EngineVersion]" --output table`: Confirm each reported DB instance now reports a supported engine version.

## Detected by

The `database` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Other versions of this product

- [RDS for PostgreSQL 10 is past end of standard support](database.aws-rds-postgres.end-of-support-10.html)
- [RDS for PostgreSQL 11 is past end of standard support](database.aws-rds-postgres.end-of-support-11.html)
- [RDS for PostgreSQL 13 is past end of standard support](database.aws-rds-postgres.end-of-support-13.html)
- [RDS for PostgreSQL 9.6 is past end of standard support](database.aws-rds-postgres.end-of-support-9.6.html)
- [RDS for PostgreSQL 14 reaches end of standard support on 2027-02-28](database.aws-rds-postgres.scheduled-end-of-support-14.html)

### Same ecosystem

- [Aurora MySQL version 1 is past end of standard support](database.aws-aurora-mysql.end-of-support-5.6.html)
- [Aurora MySQL version 2 is past end of standard support](database.aws-aurora-mysql.end-of-support-5.7.html)
- [Aurora PostgreSQL 11 is past end of standard support](database.aws-aurora-postgresql.end-of-support-11.html)
- [Aurora PostgreSQL 12 is past end of standard support](database.aws-aurora-postgresql.end-of-support-12.html)
- [Aurora PostgreSQL 13 is past end of standard support](database.aws-aurora-postgresql.end-of-support-13.html)
- [Aurora PostgreSQL 14 reaches end of standard support on 2027-02-28](database.aws-aurora-postgresql.scheduled-end-of-support-14.html)
- [ElastiCache for Redis OSS 4 is past end of standard support](database.aws-elasticache-redis.end-of-support-4.html)
- [ElastiCache for Redis OSS 5 is past end of standard support](database.aws-elasticache-redis.end-of-support-5.html)


## Data

This page is generated from [`registry/database.json`](https://github.com/arminazimi/evergreen/blob/main/registry/database.json), rule `database.aws-rds-postgres.end-of-support-12`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/database.aws-rds-postgres.end-of-support-12.html",
      "url": "https://arminazimi.github.io/evergreen/rules/database.aws-rds-postgres.end-of-support-12.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/database.aws-rds-postgres.end-of-support-12.html",
      "headline": "RDS for PostgreSQL 12 is past end of standard support — dates, impact, migration",
      "description": "AWS ended standard support for RDS for PostgreSQL 12 on 2025-02-28. RDS Extended Support may keep it running for a fee through 2028-02-29. Upgrade to PostgreSQL 15 or later.",
      "inLanguage": "en",
      "dateModified": "2026-10-30",
      "keywords": [
        "end-of-support",
        "database",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "RDS for PostgreSQL 12 is past end of standard support",
        "identifier": "pkg:generic/aws-rds/postgres"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Release calendars for Amazon RDS for PostgreSQL",
          "url": "https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-release-calendar.html"
        },
        {
          "@type": "CreativeWork",
          "name": "Using Amazon RDS Extended Support",
          "url": "https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/extended-support.html"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/database.aws-rds-postgres.end-of-support-12.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/database.aws-rds-postgres.end-of-support-12.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/aws-rds/postgres?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of support as of 2025-02-28. Affected versions: vers:intdot/>=12|\u003c13. Source: Release calendars for Amazon RDS for PostgreSQL (https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-release-calendar.html)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/aws-rds/postgres?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "PostgreSQL 15 or later"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/aws-rds/postgres?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/aws-rds/postgres."
          }
        }
      ]
    }
  ]
}
</script>
