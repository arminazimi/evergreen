---
title: "Is MariaDB end of life? — versions, dates, sources"
description: "Some MariaDB releases are end of life. MariaDB image release lines 10.10 and older are end-of-life as of 2026-07-06."
canonical_url: "https://arminazimi.github.io/evergreen/eol/docker-mariadb.html"
---

# Is MariaDB end of life?

**Some MariaDB releases are end of life.** MariaDB image release lines 10.10 and older are end-of-life as of 2026-07-06. This page lists 1 reviewed lifecycle rule for `pkg:docker/library/mariadb`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:docker/library/mariadb
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [MariaDB image release lines 10.10 and older are end-of-life](../rules/container.mariadb.eol-10.10-and-older.html) | End of life | 2026-07-06 | `vers:semver/<10.11.0` | [MariaDB release policy (vendor)](https://mariadb.org/about/#maintenance-policy) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/docker-mariadb.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/docker-mariadb.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is MariaDB end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Some MariaDB releases are end of life. MariaDB image release lines 10.10 and older are end-of-life as of 2026-07-06. This page lists 1 reviewed lifecycle rule for pkg:docker/library/mariadb, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check MariaDB?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:docker/library/mariadb."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the MariaDB dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
