---
title: "Is MySQL Docker image end of life? — versions, dates, sources"
description: "Some MySQL Docker image releases are end of life. MySQL image release lines 8.0 and older are past end-of-life as of 2026-04-21."
canonical_url: "https://arminazimi.github.io/evergreen/eol/docker-mysql.html"
---

# Is MySQL Docker image end of life?

**Some MySQL Docker image releases are end of life.** MySQL image release lines 8.0 and older are past end-of-life as of 2026-04-21. This page lists 1 reviewed lifecycle rule for `pkg:docker/library/mysql`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:docker/library/mysql
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [MySQL image release lines 8.0 and older are past end-of-life](../rules/container.mysql.eol-8.0-and-older.html) | End of life | 2026-04-21 | `vers:semver/<8.1.0` | [MySQL end-of-life notice](https://www.mysql.com/support/eol-notice.html) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/docker-mysql.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/docker-mysql.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is MySQL Docker image end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Some MySQL Docker image releases are end of life. MySQL image release lines 8.0 and older are past end-of-life as of 2026-04-21. This page lists 1 reviewed lifecycle rule for pkg:docker/library/mysql, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check MySQL Docker image?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:docker/library/mysql."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the MySQL Docker image dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
