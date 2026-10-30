---
title: "Is Alpine Linux end of life? — versions, dates, sources"
description: "Some Alpine Linux releases are end of life. Alpine Linux image release lines 3.20 and older are end-of-life as of 2026-04-01."
canonical_url: "https://arminazimi.github.io/evergreen/eol/docker-alpine.html"
---

# Is Alpine Linux end of life?

**Some Alpine Linux releases are end of life.** Alpine Linux image release lines 3.20 and older are end-of-life as of 2026-04-01. This page lists 2 reviewed lifecycle rules for `pkg:docker/library/alpine`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:docker/library/alpine
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [Alpine Linux image release lines 3.20 and older are end-of-life](../rules/container.alpine.eol-3.20-and-older.html) | End of life | 2026-04-01 | `vers:semver/<3.21.0` | [Alpine Linux releases](https://alpinelinux.org/releases/) |
| [Alpine Linux image release line 3.21 reaches end-of-life on 2026-11-01](../rules/container.alpine.eol-3.21.html) | Scheduled end of life | 2026-11-01 | `vers:semver/>=3.21.0\|<3.22.0` | [Alpine Linux releases](https://alpinelinux.org/releases/) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/docker-alpine.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/docker-alpine.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Alpine Linux end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Some Alpine Linux releases are end of life. Alpine Linux image release lines 3.20 and older are end-of-life as of 2026-04-01. This page lists 2 reviewed lifecycle rules for pkg:docker/library/alpine, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check Alpine Linux?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:docker/library/alpine."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the Alpine Linux dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
