---
title: "Is Deno end of life? — versions, dates, sources"
description: "Some Deno releases are end of life. Deno 1.x is end-of-life as of 2024-10-09. This page lists 2 reviewed lifecycle rules for pkg:generic/deno, with the status, date, and source for each."
canonical_url: "https://arminazimi.github.io/evergreen/eol/deno.html"
---

# Is Deno end of life?

**Some Deno releases are end of life.** Deno 1.x is end-of-life as of 2024-10-09. This page lists 2 reviewed lifecycle rules for `pkg:generic/deno`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:generic/deno
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [Deno 1.x is end-of-life](../rules/deno.runtime.eol-1.x.html) | End of life | 2024-10-09 | `vers:semver/>=1.0.0\|<2.0.0` | [Deno 2.0.0 Release](https://github.com/denoland/deno/releases/tag/v2.0.0) |
| [Deno 0.x pre-release is end-of-life](../rules/deno.runtime.eol-0.x.html) | End of life | 2020-05-13 | `vers:semver/>=0.1.0\|<1.0.0` | [Deno 1.0.0 Release](https://github.com/denoland/deno/releases/tag/v1.0.0) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/deno.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/deno.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Deno end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Some Deno releases are end of life. Deno 1.x is end-of-life as of 2024-10-09. This page lists 2 reviewed lifecycle rules for pkg:generic/deno, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check Deno?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:generic/deno."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the Deno dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
