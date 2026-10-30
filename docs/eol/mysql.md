---
title: "Is MySQL end of life? — versions, dates, sources"
description: "Some MySQL releases are end of life. MySQL 8.0 is end-of-life as of 2026-04-30. This page lists 2 reviewed lifecycle rules for pkg:generic/mysql, with the status, date, and source for each."
canonical_url: "https://arminazimi.github.io/evergreen/eol/mysql.html"
---

# Is MySQL end of life?

**Some MySQL releases are end of life.** MySQL 8.0 is end-of-life as of 2026-04-30. This page lists 2 reviewed lifecycle rules for `pkg:generic/mysql`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:generic/mysql
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [MySQL 8.0 is end-of-life](../rules/database.mysql.end-of-life-8.0.html) | End of life | 2026-04-30 | `vers:semver/>=8.0.0\|<8.1.0` | [MySQL supported platforms and lifecycle](https://www.mysql.com/support/supportedplatforms/database.html), [endoflife.date: MySQL](https://endoflife.date/mysql) |
| [MySQL 5.7 is end-of-life](../rules/database.mysql.end-of-life-5.7.html) | End of life | 2023-10-31 | `vers:semver/>=5.7.0\|<5.8.0` | [MySQL supported platforms and lifecycle](https://www.mysql.com/support/supportedplatforms/database.html), [endoflife.date: MySQL](https://endoflife.date/mysql) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/mysql.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/mysql.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is MySQL end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Some MySQL releases are end of life. MySQL 8.0 is end-of-life as of 2026-04-30. This page lists 2 reviewed lifecycle rules for pkg:generic/mysql, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check MySQL?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:generic/mysql."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the MySQL dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
