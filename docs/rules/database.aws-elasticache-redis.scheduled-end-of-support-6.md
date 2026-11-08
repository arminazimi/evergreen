---
title: "ElastiCache for Redis OSS 6 reaches end of standard support on 2027-01-31 — dates, impact, migration"
description: "AWS ends standard support for ElastiCache for Redis OSS 6 on 2027-01-31. RDS Extended Support may keep it running for a fee through 2030-01-31. Upgrade to Valkey or Redis OSS 7.1 or later before then."
layout: doc
permalink: "/rules/database.aws-elasticache-redis.scheduled-end-of-support-6.html"
canonical_url: "https://arminazimi.github.io/evergreen/rules/database.aws-elasticache-redis.scheduled-end-of-support-6.html"
image: "/assets/og/database.aws-elasticache-redis.scheduled-end-of-support-6.svg"
review_date: "2026-10-30"
last_modified_at: "2026-10-30"
json_twin: "/rules/database.aws-elasticache-redis.scheduled-end-of-support-6.json"
---

# ElastiCache for Redis OSS 6 reaches end of standard support on 2027-01-31

**Scheduled end of life** as of 2027-01-31. Replacement: Valkey or Redis OSS 7.1 or later. Source: [Engine versions and upgrading in ElastiCache](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/engine-versions.html).

Check a version:

```bash
evergreen check pkg:generic/aws-elasticache/redis
```

AWS ends standard support for ElastiCache for Redis OSS 6 on 2027-01-31. RDS Extended Support may keep it running for a fee through 2030-01-31. Upgrade to Valkey or Redis OSS 7.1 or later before then.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Scheduled end of life |
| Severity | low |
| Ecosystem | `database` |
| Component | `pkg:generic/aws-elasticache/redis` |
| Affected versions | `vers:intdot/>=6\|<7` |
| Date from the source | 2027-01-31 |
| Replacement | Valkey or Redis OSS 7.1 or later |
| Evidence last seen | 2026-10-30 |
| Reviewed | 2026-10-30 by arminazimi, drafted by the `aws-rds` importer |
| Review due | 2027-01-28 (90 days after the last review) |
| Rule ID | `database.aws-elasticache-redis.scheduled-end-of-support-6` |

## Sources

- [Engine versions and upgrading in ElastiCache](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/engine-versions.html) (accessed 2026-10-30)
- [ElastiCache Extended Support](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/extended-support.html) (accessed 2026-10-30)

## Migration

**Constraints**

- An ElastiCache engine upgrade is an in-place modification; the cache is unavailable while nodes are replaced, and restoring a cluster-mode-disabled cache over a newer engine is not a rollback.
- Take a manual backup before the change and verify that it can be restored.
- Extended Support keeps the cache running past the end of standard support for a fee; it does not replace moving to Valkey or Redis OSS 7.1 or later.

**Steps**

1. **Take a backup.** Take a manual ElastiCache backup of every reported cluster and verify that it can be restored.
2. **Upgrade the engine.** Modify the cache cluster or replication group to a supported engine version, or create a new cache on Valkey or Redis OSS 7.1 or later and move clients to it.
3. **Raise the declared version.** Change engine_version in every aws_elasticache_cluster and aws_elasticache_replication_group block, Compose service, and Helm value that runs this cache.
4. **Check clients and parameter groups.** Update Redis clients, connection strings, and parameter groups that assume the old engine version.

**Verification**

- `terraform plan`: Review the plan and confirm the engine_version change is intended and is the only cache change.
- `docker compose config`: Confirm any local Compose service that mirrors this cache is valid and uses an image tag that matches Valkey or Redis OSS 7.1 or later.
- `aws elasticache describe-cache-clusters --query "CacheClusters[?Engine=='redis'].[CacheClusterId,EngineVersion]" --output table`: Confirm each reported cache cluster now reports a supported Redis OSS engine version.

## Detected by

The `database` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Other versions of this product

- [ElastiCache for Redis OSS 4 is past end of standard support](database.aws-elasticache-redis.end-of-support-4.html)
- [ElastiCache for Redis OSS 5 is past end of standard support](database.aws-elasticache-redis.end-of-support-5.html)

### Same ecosystem

- [Aurora MySQL version 1 is past end of standard support](database.aws-aurora-mysql.end-of-support-5.6.html)
- [Aurora MySQL version 2 is past end of standard support](database.aws-aurora-mysql.end-of-support-5.7.html)
- [Aurora PostgreSQL 11 is past end of standard support](database.aws-aurora-postgresql.end-of-support-11.html)
- [Aurora PostgreSQL 12 is past end of standard support](database.aws-aurora-postgresql.end-of-support-12.html)
- [Aurora PostgreSQL 13 is past end of standard support](database.aws-aurora-postgresql.end-of-support-13.html)
- [Aurora PostgreSQL 14 reaches end of standard support on 2027-02-28](database.aws-aurora-postgresql.scheduled-end-of-support-14.html)
- [RDS for MySQL 5.7 is past end of standard support](database.aws-rds-mysql.end-of-support-5.7.html)
- [RDS for MySQL 8.0 is past end of standard support](database.aws-rds-mysql.end-of-support-8.0.html)


## Data

This page is generated from [`registry/database.json`](https://github.com/arminazimi/evergreen/blob/main/registry/database.json), rule `database.aws-elasticache-redis.scheduled-end-of-support-6`, in the `ebb.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/database.aws-elasticache-redis.scheduled-end-of-support-6.html",
      "url": "https://arminazimi.github.io/evergreen/rules/database.aws-elasticache-redis.scheduled-end-of-support-6.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/database.aws-elasticache-redis.scheduled-end-of-support-6.html",
      "headline": "ElastiCache for Redis OSS 6 reaches end of standard support on 2027-01-31 — dates, impact, migration",
      "description": "AWS ends standard support for ElastiCache for Redis OSS 6 on 2027-01-31. RDS Extended Support may keep it running for a fee through 2030-01-31. Upgrade to Valkey or Redis OSS 7.1 or later before then.",
      "inLanguage": "en",
      "dateModified": "2026-10-30",
      "keywords": [
        "scheduled-end-of-life",
        "database",
        "low"
      ],
      "about": {
        "@type": "Thing",
        "name": "ElastiCache for Redis OSS 6 reaches end of standard support on 2027-01-31",
        "identifier": "pkg:generic/aws-elasticache/redis"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Engine versions and upgrading in ElastiCache",
          "url": "https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/engine-versions.html"
        },
        {
          "@type": "CreativeWork",
          "name": "ElastiCache Extended Support",
          "url": "https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/extended-support.html"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/database.aws-elasticache-redis.scheduled-end-of-support-6.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/database.aws-elasticache-redis.scheduled-end-of-support-6.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/aws-elasticache/redis?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Scheduled end of life as of 2027-01-31. Affected versions: vers:intdot/>=6|\u003c7. Source: Engine versions and upgrading in ElastiCache (https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/engine-versions.html)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/aws-elasticache/redis?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Valkey or Redis OSS 7.1 or later"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/aws-elasticache/redis?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/aws-elasticache/redis."
          }
        }
      ]
    }
  ]
}
</script>
