---
title: "Is Caddy end of life? — versions, dates, sources"
description: "Some Caddy releases are end of life. Caddy image release lines 1 and older are end-of-life as of 2020-07-01."
canonical_url: "https://arminazimi.github.io/evergreen/eol/docker-caddy.html"
---

# Is Caddy end of life?

**Some Caddy releases are end of life.** Caddy image release lines 1 and older are end-of-life as of 2020-07-01. This page lists 1 reviewed lifecycle rule for `pkg:docker/library/caddy`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:docker/library/caddy
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [Caddy image release lines 1 and older are end-of-life](../rules/container.caddy.eol-1-and-older.html) | End of life | 2020-07-01 | `vers:semver/<2.0.0` | [Caddy release policy (vendor)](https://github.com/caddyserver/caddy/security) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/docker-caddy.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/docker-caddy.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Caddy end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Some Caddy releases are end of life. Caddy image release lines 1 and older are end-of-life as of 2020-07-01. This page lists 1 reviewed lifecycle rule for pkg:docker/library/caddy, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check Caddy?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:docker/library/caddy."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the Caddy dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
