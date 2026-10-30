---
title: "Is Bun end of life? — versions, dates, sources"
description: "Some Bun releases are end of life. Bun 1.0.x is end-of-life as of 2024-04-01. This page lists 2 reviewed lifecycle rules for pkg:generic/bun, with the status, date, and source for each."
canonical_url: "https://arminazimi.github.io/evergreen/eol/bun.html"
---

# Is Bun end of life?

**Some Bun releases are end of life.** Bun 1.0.x is end-of-life as of 2024-04-01. This page lists 2 reviewed lifecycle rules for `pkg:generic/bun`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:generic/bun
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [Bun 1.0.x is end-of-life](../rules/deno.bun.runtime.eol-1.0.html) | End of life | 2024-04-01 | `vers:semver/>=1.0.0\|<1.1.0` | [Bun 1.1.0 Release](https://github.com/oven-sh/bun/releases/tag/bun-v1.1.0) |
| [Bun 0.x pre-release is end-of-life](../rules/deno.bun.runtime.eol-0.x.html) | End of life | 2023-09-08 | `vers:semver/>=0.1.0\|<1.0.0` | [Bun 1.0.0 Release](https://github.com/oven-sh/bun/releases/tag/bun-v1.0.0) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/bun.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/bun.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Bun end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Some Bun releases are end of life. Bun 1.0.x is end-of-life as of 2024-04-01. This page lists 2 reviewed lifecycle rules for pkg:generic/bun, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check Bun?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:generic/bun."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the Bun dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
