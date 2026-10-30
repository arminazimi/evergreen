---
title: "Is Redis Docker image end of life? — versions, dates, sources"
description: "Some Redis Docker image releases are end of life. Redis image release lines 6.0 and older are end-of-life as of 2022-05-31."
canonical_url: "https://arminazimi.github.io/evergreen/eol/docker-redis.html"
---

# Is Redis Docker image end of life?

**Some Redis Docker image releases are end of life.** Redis image release lines 6.0 and older are end-of-life as of 2022-05-31. This page lists 2 reviewed lifecycle rules for `pkg:docker/library/redis`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:docker/library/redis
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [Redis image release lines 6.0 and older are end-of-life](../rules/container.redis.eol-6.0-and-older.html) | End of life | 2022-05-31 | `vers:semver/<6.2.0` | [Redis release policy (vendor)](https://redis.io/docs/latest/operate/oss_and_stack/install/version-mgmt/) |
| [Redis image release line 6.2 reaches end-of-life on 2027-04-01](../rules/container.redis.eol-6.2-and-older.html) | Scheduled end of life | 2027-04-01 | `vers:semver/>=6.2.0\|<6.3.0` | [Redis release policy (vendor)](https://redis.io/docs/latest/operate/oss_and_stack/install/version-mgmt/) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/docker-redis.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/docker-redis.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Redis Docker image end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Some Redis Docker image releases are end of life. Redis image release lines 6.0 and older are end-of-life as of 2022-05-31. This page lists 2 reviewed lifecycle rules for pkg:docker/library/redis, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check Redis Docker image?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:docker/library/redis."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the Redis Docker image dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
