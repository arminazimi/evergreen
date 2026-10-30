---
title: "Redis image release line 6.2 reaches end-of-life on 2027-04-01 — dates, impact, migration"
description: "The Redis 6.2 release line is scheduled to stop receiving fixes from the vendor on 2027-04-01."
canonical_url: "https://arminazimi.github.io/evergreen/rules/container.redis.eol-6.2-and-older.html"
json_twin: "/rules/container.redis.eol-6.2-and-older.json"
---

# Redis image release line 6.2 reaches end-of-life on 2027-04-01

**Scheduled end of life** as of 2027-04-01. Replacement: A redis image on a later supported release line. Source: [Redis release policy (vendor)](https://redis.io/docs/latest/operate/oss_and_stack/install/version-mgmt/).

Check a version:

```bash
evergreen check pkg:docker/library/redis
```

The Redis 6.2 release line is scheduled to stop receiving fixes from the vendor on 2027-04-01.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Scheduled end of life |
| Severity | low |
| Ecosystem | `container` |
| Component | `pkg:docker/library/redis` |
| Affected versions | `vers:semver/>=6.2.0\|<6.3.0` |
| Date from the source | 2027-04-01 |
| Replacement | A redis image on a later supported release line |
| Evidence last seen | 2026-10-30 |
| Reviewed | 2026-10-30 by arminazimi, drafted by the `endoflife-date` importer |
| Review due | 2027-10-30 (365 days after the last review) |
| Rule ID | `container.redis.eol-6.2-and-older` |

## Sources

- [Redis release policy (vendor)](https://redis.io/docs/latest/operate/oss_and_stack/install/version-mgmt/)

## Migration

**Constraints**

- Keep the base image, Compose image, CI service containers, and deployment manifests that use redis on one supported Redis release line.
- Confirm the application and its data or configuration work on the target Redis release; read the vendor's upgrade notes before moving across several release lines.

**Steps**

1. **Update the base image.** Change the reported FROM line or Compose image to a tag on a supported release line, and pin it to a digest if your policy requires.
2. **Align other image references.** Update other Dockerfiles, Compose files, CI service containers, and deployment manifests that use the same image so they agree.

**Verification**

- `docker build .`: Build the image on the new base.
- `docker run --rm IMAGE sh -c 'echo ok'`: Confirm the container starts on the new base.

## Detected by

The [`container`](../detectors/container.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Other versions of this product

- [Redis image release lines 6.0 and older are end-of-life](container.redis.eol-6.0-and-older.html)

### Same ecosystem

- [Alpine Linux image release lines 3.20 and older are end-of-life](container.alpine.eol-3.20-and-older.html)
- [Alpine Linux image release line 3.21 reaches end-of-life on 2026-11-01](container.alpine.eol-3.21.html)
- [Caddy image release lines 1 and older are end-of-life](container.caddy.eol-1-and-older.html)
- [ClickHouse image release lines 26.2 and older are end-of-life](container.clickhouse.eol-26.2-and-older.html)
- [Couchbase Server image release lines 7.2 and older are end-of-life](container.couchbase.eol-7.2-and-older.html)
- [Apache CouchDB image release lines 3.3 and older are end-of-life](container.couchdb.eol-3.3-and-older.html)
- [Debian image release lines 11 and older are end-of-life](container.debian.eol-11-and-older.html)
- [Drupal image release lines 10.5 and older are end-of-life](container.drupal.eol-10.5-and-older.html)


## Data

This page is generated from [`registry/container.json`](https://github.com/arminazimi/evergreen/blob/main/registry/container.json), rule `container.redis.eol-6.2-and-older`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/container.redis.eol-6.2-and-older.html",
      "url": "https://arminazimi.github.io/evergreen/rules/container.redis.eol-6.2-and-older.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/container.redis.eol-6.2-and-older.html",
      "headline": "Redis image release line 6.2 reaches end-of-life on 2027-04-01 — dates, impact, migration",
      "description": "The Redis 6.2 release line is scheduled to stop receiving fixes from the vendor on 2027-04-01.",
      "inLanguage": "en",
      "dateModified": "2026-10-30",
      "keywords": [
        "scheduled-end-of-life",
        "container",
        "low"
      ],
      "about": {
        "@type": "Thing",
        "name": "Redis image release line 6.2 reaches end-of-life on 2027-04-01",
        "identifier": "pkg:docker/library/redis"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Redis release policy (vendor)",
          "url": "https://redis.io/docs/latest/operate/oss_and_stack/install/version-mgmt/"
        }
      ],
      "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/container.json",
      "publisher": {
        "@type": "Organization",
        "name": "Evergreen",
        "url": "https://arminazimi.github.io/evergreen"
      }
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/container.redis.eol-6.2-and-older.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/container.redis.eol-6.2-and-older.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:docker/library/redis?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Scheduled end of life as of 2027-04-01. Affected versions: vers:semver/>=6.2.0|\u003c6.3.0. Source: Redis release policy (vendor) (https://redis.io/docs/latest/operate/oss_and_stack/install/version-mgmt/)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:docker/library/redis?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A redis image on a later supported release line"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:docker/library/redis?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:docker/library/redis."
          }
        }
      ]
    }
  ]
}
</script>
