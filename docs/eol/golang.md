---
title: "Is Go end of life? — versions, dates, sources"
description: "Go has releases that are out of support. Go 1.25 is no longer supported as of 2026-08-19. This page lists 6 reviewed lifecycle rules for pkg:generic/golang, with the status, date, and source for each."
canonical_url: "https://arminazimi.github.io/evergreen/eol/golang.html"
---

# Is Go end of life?

**Go has releases that are out of support.** Go 1.25 is no longer supported as of 2026-08-19. This page lists 6 reviewed lifecycle rules for `pkg:generic/golang`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:generic/golang
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [Go 1.25 is no longer supported](../rules/go.runtime.end-of-support-1.25.html) | End of support | 2026-08-19 | `vers:golang/>=1.25.0\|<1.26.0` | [Go release history and support policy](https://go.dev/doc/devel/release) |
| [Go 1.24 is no longer supported](../rules/go.runtime.end-of-support-1.24.html) | End of support | 2026-02-10 | `vers:golang/>=1.24.0\|<1.25.0` | [Go release history and support policy](https://go.dev/doc/devel/release) |
| [Go 1.23 is no longer supported](../rules/go.runtime.end-of-support-1.23.html) | End of support | 2025-08-12 | `vers:golang/>=1.23.0\|<1.24.0` | [Go release history and support policy](https://go.dev/doc/devel/release) |
| [Go 1.22 is no longer supported](../rules/go.runtime.end-of-support-1.22.html) | End of support | 2025-02-11 | `vers:golang/>=1.22.0\|<1.23.0` | [Go release history and support policy](https://go.dev/doc/devel/release) |
| [Go 1.21 is no longer supported](../rules/go.runtime.end-of-support-1.21.html) | End of support | 2024-08-13 | `vers:golang/>=1.21.0\|<1.22.0` | [Go release history and support policy](https://go.dev/doc/devel/release) |
| [Go 1.20 and older are no longer supported](../rules/go.runtime.end-of-support-1.20-and-older.html) | End of support | 2024-02-06 | `vers:golang/<1.21.0` | [Go release history and support policy](https://go.dev/doc/devel/release) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/golang.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/golang.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Go end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Go has releases that are out of support. Go 1.25 is no longer supported as of 2026-08-19. This page lists 6 reviewed lifecycle rules for pkg:generic/golang, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check Go?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:generic/golang."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the Go dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
