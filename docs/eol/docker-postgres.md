---
title: "Is PostgreSQL Docker image end of life? — versions, dates, sources"
description: "Some PostgreSQL Docker image releases are end of life. PostgreSQL image major versions 13 and older are end-of-life as of 2025-11-13."
canonical_url: "https://arminazimi.github.io/evergreen/eol/docker-postgres.html"
---

# Is PostgreSQL Docker image end of life?

**Some PostgreSQL Docker image releases are end of life.** PostgreSQL image major versions 13 and older are end-of-life as of 2025-11-13. This page lists 2 reviewed lifecycle rules for `pkg:docker/library/postgres`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:docker/library/postgres
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [PostgreSQL image major versions 13 and older are end-of-life](../rules/container.postgres.eol-13-and-older.html) | End of life | 2025-11-13 | `vers:semver/<14.0.0` | [PostgreSQL versioning policy](https://www.postgresql.org/support/versioning/) |
| [PostgreSQL image release line 14 reaches end-of-life on 2026-11-12](../rules/container.postgres.eol-14-and-older.html) | Scheduled end of life | 2026-11-12 | `vers:semver/>=14.0.0\|<15.0.0` | [PostgreSQL release policy (vendor)](https://www.postgresql.org/support/versioning/) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/docker-postgres.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/docker-postgres.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is PostgreSQL Docker image end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Some PostgreSQL Docker image releases are end of life. PostgreSQL image major versions 13 and older are end-of-life as of 2025-11-13. This page lists 2 reviewed lifecycle rules for pkg:docker/library/postgres, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check PostgreSQL Docker image?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:docker/library/postgres."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the PostgreSQL Docker image dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
