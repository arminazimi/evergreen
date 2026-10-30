---
title: "Is Traefik end of life? — versions, dates, sources"
description: "Some Traefik releases are end of life. Traefik image release lines 3.6 and older are end-of-life as of 2026-08-16."
canonical_url: "https://arminazimi.github.io/evergreen/eol/docker-traefik.html"
---

# Is Traefik end of life?

**Some Traefik releases are end of life.** Traefik image release lines 3.6 and older are end-of-life as of 2026-08-16. This page lists 1 reviewed lifecycle rule for `pkg:docker/library/traefik`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:docker/library/traefik
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [Traefik image release lines 3.6 and older are end-of-life](../rules/container.traefik.eol-3.6-and-older.html) | End of life | 2026-08-16 | `vers:semver/<3.7.0` | [Traefik release policy (vendor)](https://doc.traefik.io/traefik/deprecation/releases) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/docker-traefik.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/docker-traefik.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Traefik end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Some Traefik releases are end of life. Traefik image release lines 3.6 and older are end-of-life as of 2026-08-16. This page lists 1 reviewed lifecycle rule for pkg:docker/library/traefik, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check Traefik?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:docker/library/traefik."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the Traefik dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
