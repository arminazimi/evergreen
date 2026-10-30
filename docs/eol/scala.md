---
title: "Is Scala end of life? — versions, dates, sources"
description: "Some Scala releases are end of life. Scala 2.11 reached end of life as of 2016-01-01. This page lists 2 reviewed lifecycle rules for pkg:generic/scala, with the status, date, and source for each."
canonical_url: "https://arminazimi.github.io/evergreen/eol/scala.html"
---

# Is Scala end of life?

**Some Scala releases are end of life.** Scala 2.11 reached end of life as of 2016-01-01. This page lists 2 reviewed lifecycle rules for `pkg:generic/scala`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:generic/scala
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [Scala 2.11 reached end of life](../rules/scala.runtime.eol-2.11.html) | End of life | 2016-01-01 | `vers:semver/>=2.11.0\|<2.12.0` | [Scala development guarantees — Scala 2.11 status](https://scala-lang.org/development/), [Scala 2 maintenance plans](https://www.scala-lang.org/blog/2024/12/16/scala-2-maintenance.html) |
| [Scala 3.0–3.2 no longer receive patches](../rules/scala.runtime.eos-3.0-3.2.html) | End of support | The source gives no day | `vers:semver/>=3.0.0\|<3.3.0` | [Scala development guarantees — Scala 3 LTS](https://scala-lang.org/development/), [Scala 3.9 LTS released](https://scala-lang.org/news/3.9/) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/scala.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/scala.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Scala end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Some Scala releases are end of life. Scala 2.11 reached end of life as of 2016-01-01. This page lists 2 reviewed lifecycle rules for pkg:generic/scala, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check Scala?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:generic/scala."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the Scala dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
