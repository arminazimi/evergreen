---
title: "Is ClickHouse end of life? — versions, dates, sources"
description: "Some ClickHouse releases are end of life. ClickHouse image release lines 26.2 and older are end-of-life. The source gives no day."
canonical_url: "https://arminazimi.github.io/evergreen/eol/docker-clickhouse.html"
---

# Is ClickHouse end of life?

**Some ClickHouse releases are end of life.** ClickHouse image release lines 26.2 and older are end-of-life. The source gives no day. This page lists 1 reviewed lifecycle rule for `pkg:docker/library/clickhouse`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:docker/library/clickhouse
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [ClickHouse image release lines 26.2 and older are end-of-life](../rules/container.clickhouse.eol-26.2-and-older.html) | End of life | The source gives no day | `vers:semver/<26.3.0` | [ClickHouse security policy: supported versions](https://github.com/ClickHouse/ClickHouse/blob/master/SECURITY.md) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/docker-clickhouse.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/docker-clickhouse.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is ClickHouse end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Some ClickHouse releases are end of life. ClickHouse image release lines 26.2 and older are end-of-life. The source gives no day. This page lists 1 reviewed lifecycle rule for pkg:docker/library/clickhouse, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check ClickHouse?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:docker/library/clickhouse."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the ClickHouse dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
