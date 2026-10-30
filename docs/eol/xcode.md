---
title: "Is Xcode end of life? — versions, dates, sources"
description: "Xcode has releases that are out of support. Xcode 15 through 25 are not accepted for App Store uploads as of 2026-04-28."
canonical_url: "https://arminazimi.github.io/evergreen/eol/xcode.html"
---

# Is Xcode end of life?

**Xcode has releases that are out of support.** Xcode 15 through 25 are not accepted for App Store uploads as of 2026-04-28. This page lists 2 reviewed lifecycle rules for `pkg:generic/xcode`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:generic/xcode
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [Xcode 15 through 25 are not accepted for App Store uploads](../rules/swift.xcode.app-store-15-through-25.html) | End of support | 2026-04-28 | `vers:semver/>=15.0.0\|<26.0.0` | [SDK minimum requirements — App Store upcoming requirements (Xcode 26)](https://developer.apple.com/news/upcoming-requirements/?id=04282026a) |
| [Xcode older than 15 is not accepted for App Store uploads](../rules/swift.xcode.app-store-below-15.html) | End of support | 2024-04-29 | `vers:semver/<15.0.0` | [Xcode 15 — App Store upcoming requirements](https://developer.apple.com/news/upcoming-requirements/?id=04292024a) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/xcode.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/xcode.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Xcode end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Xcode has releases that are out of support. Xcode 15 through 25 are not accepted for App Store uploads as of 2026-04-28. This page lists 2 reviewed lifecycle rules for pkg:generic/xcode, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check Xcode?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:generic/xcode."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the Xcode dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
