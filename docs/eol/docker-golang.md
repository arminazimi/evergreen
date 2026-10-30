---
title: "Is Go Docker image end of life? — versions, dates, sources"
description: "Some Go Docker image releases are end of life. Go image release lines 1.25 and older are end-of-life as of 2026-08-19."
canonical_url: "https://arminazimi.github.io/evergreen/eol/docker-golang.html"
---

# Is Go Docker image end of life?

**Some Go Docker image releases are end of life.** Go image release lines 1.25 and older are end-of-life as of 2026-08-19. This page lists 1 reviewed lifecycle rule for `pkg:docker/library/golang`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:docker/library/golang
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [Go image release lines 1.25 and older are end-of-life](../rules/container.golang.eol-1.25-and-older.html) | End of life | 2026-08-19 | `vers:semver/<1.26.0` | [Go release policy (vendor)](https://go.dev/doc/devel/release#policy) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/docker-golang.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/docker-golang.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Go Docker image end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Some Go Docker image releases are end of life. Go image release lines 1.25 and older are end-of-life as of 2026-08-19. This page lists 1 reviewed lifecycle rule for pkg:docker/library/golang, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check Go Docker image?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:docker/library/golang."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the Go Docker image dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
