---
title: "Is PostgreSQL end of life? — versions, dates, sources"
description: "Some PostgreSQL releases are end of life. PostgreSQL 13 is no longer a supported major version as of 2025-11-13."
canonical_url: "https://arminazimi.github.io/evergreen/eol/postgresql.html"
---

# Is PostgreSQL end of life?

**Some PostgreSQL releases are end of life.** PostgreSQL 13 is no longer a supported major version as of 2025-11-13. This page lists 5 reviewed lifecycle rules for `pkg:generic/postgresql`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:generic/postgresql
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [PostgreSQL 13 is no longer a supported major version](../rules/database.postgresql.end-of-life-13.html) | End of life | 2025-11-13 | `vers:semver/>=13.0.0\|<14.0.0` | [PostgreSQL versioning policy](https://www.postgresql.org/support/versioning/), [endoflife.date: PostgreSQL](https://endoflife.date/postgresql) |
| [PostgreSQL 12 is no longer a supported major version](../rules/database.postgresql.end-of-life-12.html) | End of life | 2024-11-21 | `vers:semver/>=12.0.0\|<13.0.0` | [PostgreSQL versioning policy](https://www.postgresql.org/support/versioning/), [endoflife.date: PostgreSQL](https://endoflife.date/postgresql) |
| [PostgreSQL 11 is no longer a supported major version](../rules/database.postgresql.end-of-life-11.html) | End of life | 2023-11-09 | `vers:semver/>=11.0.0\|<12.0.0` | [PostgreSQL versioning policy](https://www.postgresql.org/support/versioning/), [endoflife.date: PostgreSQL](https://endoflife.date/postgresql) |
| [PostgreSQL 10 is no longer a supported major version](../rules/database.postgresql.end-of-life-10.html) | End of life | 2022-11-10 | `vers:semver/>=10.0.0\|<11.0.0` | [PostgreSQL versioning policy](https://www.postgresql.org/support/versioning/) |
| [PostgreSQL 14 reaches the end of its support on 2026-11-12](../rules/database.postgresql.end-of-life-14.html) | Scheduled end of life | 2026-11-12 | `vers:semver/>=14.0.0\|<15.0.0` | [PostgreSQL versioning policy](https://www.postgresql.org/support/versioning/) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/postgresql.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/postgresql.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is PostgreSQL end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Some PostgreSQL releases are end of life. PostgreSQL 13 is no longer a supported major version as of 2025-11-13. This page lists 5 reviewed lifecycle rules for pkg:generic/postgresql, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check PostgreSQL?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:generic/postgresql."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the PostgreSQL dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
