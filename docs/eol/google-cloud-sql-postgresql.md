---
title: "Is Cloud SQL for PostgreSQL end of life? — versions, dates, sources"
description: "Cloud SQL for PostgreSQL has releases that are out of support. Cloud SQL for PostgreSQL 13 is in extended support as of 2026-02-01."
canonical_url: "https://arminazimi.github.io/evergreen/eol/google-cloud-sql-postgresql.html"
---

# Is Cloud SQL for PostgreSQL end of life?

**Cloud SQL for PostgreSQL has releases that are out of support.** Cloud SQL for PostgreSQL 13 is in extended support as of 2026-02-01. This page lists 2 reviewed lifecycle rules for `pkg:generic/google-cloud-sql-postgresql`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:generic/google-cloud-sql-postgresql
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [Cloud SQL for PostgreSQL 13 is in extended support](../rules/database.google-cloud-sql-postgresql.extended-support-13.html) | End of support | 2026-02-01 | `vers:semver/>=13.0.0\|<14.0.0` | [Cloud SQL for PostgreSQL database versions and version policies](https://cloud.google.com/sql/docs/postgres/db-versions), [PostgreSQL versioning policy](https://www.postgresql.org/support/versioning/) |
| [Cloud SQL for PostgreSQL 9.6 through 12 are in extended support](../rules/database.google-cloud-sql-postgresql.extended-support-9.6-to-12.html) | End of support | 2025-02-01 | `vers:semver/>=9.6.0\|<13.0.0` | [Cloud SQL for PostgreSQL database versions and version policies](https://cloud.google.com/sql/docs/postgres/db-versions), [PostgreSQL versioning policy](https://www.postgresql.org/support/versioning/) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/google-cloud-sql-postgresql.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/google-cloud-sql-postgresql.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Cloud SQL for PostgreSQL end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Cloud SQL for PostgreSQL has releases that are out of support. Cloud SQL for PostgreSQL 13 is in extended support as of 2026-02-01. This page lists 2 reviewed lifecycle rules for pkg:generic/google-cloud-sql-postgresql, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check Cloud SQL for PostgreSQL?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:generic/google-cloud-sql-postgresql."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the Cloud SQL for PostgreSQL dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
