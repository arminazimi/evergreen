---
title: "Is iOS end of life? — versions, dates, sources"
description: "iOS has releases that are out of support. iOS and iPadOS app targets below iOS 13 are not accepted for App Store uploads as of 2026-09-09."
canonical_url: "https://arminazimi.github.io/evergreen/eol/ios.html"
---

# Is iOS end of life?

**iOS has releases that are out of support.** iOS and iPadOS app targets below iOS 13 are not accepted for App Store uploads as of 2026-09-09. This page lists 1 reviewed lifecycle rule for `pkg:generic/ios`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:generic/ios
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [iOS and iPadOS app targets below iOS 13 are not accepted for App Store uploads](../rules/swift.app-store.ios-below-13.html) | End of support | 2026-09-09 | `vers:semver/<13.0.0` | [iOS and iPadOS minimum system requirements — App Store upcoming requirements](https://developer.apple.com/news/upcoming-requirements/?id=0992026a) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/ios.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/ios.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is iOS end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "iOS has releases that are out of support. iOS and iPadOS app targets below iOS 13 are not accepted for App Store uploads as of 2026-09-09. This page lists 1 reviewed lifecycle rule for pkg:generic/ios, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check iOS?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:generic/ios."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the iOS dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
