---
title: "Redis 7.0 is end-of-life — dates, impact, migration"
description: "Redis 7.0 reached end of life on 2024-07-29 and no longer receives fixes from the vendor: the Redis Open Source supported-versions table drops it, and 7.0.15 from 2024-01-09 is the last patch for the…"
canonical_url: "https://arminazimi.github.io/evergreen/rules/database.redis.end-of-life-7.0.html"
image: "/assets/og/database.redis.end-of-life-7.0.svg"
json_twin: "/rules/database.redis.end-of-life-7.0.json"
---

# Redis 7.0 is end-of-life

**End of life** as of 2024-07-29. Replacement: Redis 7.4 or later. Source: [Redis Open Source version management](https://redis.io/docs/latest/operate/oss_and_stack/install/version-mgmt/).

Check a version:

```bash
evergreen check pkg:generic/redis
```

Redis 7.0 reached end of life on 2024-07-29 and no longer receives fixes from the vendor: the Redis Open Source supported-versions table drops it, and 7.0.15 from 2024-01-09 is the last patch for the line.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `database` |
| Component | `pkg:generic/redis` |
| Affected versions | `vers:semver/>=7.0.0\|<7.1.0` |
| Date from the source | 2024-07-29 |
| Replacement | Redis 7.4 or later |
| Evidence last seen | 2026-10-29 |
| Reviewed | 2026-10-29 by arminazimi |
| Review due | 2027-01-27 (90 days after the last review) |
| Rule ID | `database.redis.end-of-life-7.0` |

## Sources

- [Redis Open Source version management](https://redis.io/docs/latest/operate/oss_and_stack/install/version-mgmt/) (accessed 2026-10-29)
- [endoflife.date: Redis](https://endoflife.date/redis) (accessed 2026-10-29)

## Migration

**Constraints**

- Redis persists data in RDB snapshots and the AOF log; a dataset written by a newer server cannot be read by an older one, so a backup taken before the upgrade is the only way back.
- Replication and ACL behavior changed across the 7.x minor lines; read the release notes for every minor you cross and move traffic to an upgraded replica before switching over.
- Changing a Compose image tag restarts the container but does not migrate data: point the new version at the existing volume, or restore the backup into a fresh one.
- Managed Redis services such as ElastiCache and Memorystore name their own engine version and are not matched by this rule; check their support policy separately.

**Steps**

1. **Back up the data first.** Take a verified RDB snapshot (BGSAVE) or copy the AOF and its directory for every Redis instance in the reported files before changing any version. Keep the backup until the new version serves traffic without errors.
2. **Upgrade the Redis server.** Start the target Redis version against the existing data directory on a staging instance, or as a replica of the current server, and check the log and INFO for load errors. On Compose, change the image tag and confirm the container starts with the same volume.
3. **Raise the declared version.** Change the image tag in every Compose file that runs Redis, including overrides, to the release in the replacement. Do this in every environment, not only the reported line.
4. **Check clients and tooling.** Update Redis client libraries, ACL users that depend on renamed commands, and CI service containers or local setup documentation that assume the old Redis version.

**Verification**

- `docker compose config`: Confirm the Compose file is valid and shows the intended Redis image tag after the change.
- `redis-cli INFO server`: Confirm redis_version on the running server reports the target release.
- `terraform plan`: Review the plan and confirm no Terraform-managed resource still declares the retired Redis version line.

## Detected by

The `database` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/database.json`](https://github.com/arminazimi/evergreen/blob/main/registry/database.json), rule `database.redis.end-of-life-7.0`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/database.redis.end-of-life-7.0.html",
      "url": "https://arminazimi.github.io/evergreen/rules/database.redis.end-of-life-7.0.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/database.redis.end-of-life-7.0.html",
      "headline": "Redis 7.0 is end-of-life — dates, impact, migration",
      "description": "Redis 7.0 reached end of life on 2024-07-29 and no longer receives fixes from the vendor: the Redis Open Source supported-versions table drops it, and 7.0.15 from 2024-01-09 is the last patch for the…",
      "inLanguage": "en",
      "dateModified": "2026-10-29",
      "keywords": [
        "end-of-life",
        "database",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "Redis 7.0 is end-of-life",
        "identifier": "pkg:generic/redis"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Redis Open Source version management",
          "url": "https://redis.io/docs/latest/operate/oss_and_stack/install/version-mgmt/"
        },
        {
          "@type": "CreativeWork",
          "name": "endoflife.date: Redis",
          "url": "https://endoflife.date/redis"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/database.redis.end-of-life-7.0.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/database.redis.end-of-life-7.0.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/redis?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life as of 2024-07-29. Affected versions: vers:semver/>=7.0.0|\u003c7.1.0. Source: Redis Open Source version management (https://redis.io/docs/latest/operate/oss_and_stack/install/version-mgmt/)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/redis?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Redis 7.4 or later"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/redis?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/redis."
          }
        }
      ]
    }
  ]
}
</script>
