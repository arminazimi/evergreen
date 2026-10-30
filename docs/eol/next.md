---
title: "Is Next.js end of life? — versions, dates, sources"
description: "Next.js has releases that are out of support. Next.js 15 is out of support as of 2026-10-21. This page lists 4 reviewed lifecycle rules for pkg:npm/next, with the status, date, and source for each."
canonical_url: "https://arminazimi.github.io/evergreen/eol/next.html"
---

# Is Next.js end of life?

**Next.js has releases that are out of support.** Next.js 15 is out of support as of 2026-10-21. This page lists 4 reviewed lifecycle rules for `pkg:npm/next`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:npm/next
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [Next.js 15 is out of support](../rules/npm.package.next.15.support-end.html) | End of support | 2026-10-21 | `vers:npm/>=15.0.0\|<16.0.0` | [Next.js support policy](https://nextjs.org/support-policy), [Next.js upgrade guide: version 16](https://nextjs.org/docs/app/guides/upgrading/version-16) |
| [Next.js 14 is out of support](../rules/npm.package.next.14.support-end.html) | End of support | 2025-10-26 | `vers:npm/>=14.0.0\|<15.0.0` | [Next.js support policy](https://nextjs.org/support-policy), [Next.js upgrade guide: version 15](https://nextjs.org/docs/app/guides/upgrading/version-15), [Next.js upgrade guide: version 16](https://nextjs.org/docs/app/guides/upgrading/version-16) |
| [Next.js 13 is out of support](../rules/npm.package.next.13.support-end.html) | End of support | 2024-10-26 | `vers:npm/>=13.0.0\|<14.0.0` | [Next.js support policy](https://nextjs.org/support-policy), [Next.js upgrade guide: version 14](https://nextjs.org/docs/app/building-your-application/upgrading/version-14), [Next.js upgrade guide: version 15](https://nextjs.org/docs/app/guides/upgrading/version-15), [Next.js upgrade guide: version 16](https://nextjs.org/docs/app/guides/upgrading/version-16) |
| [Next.js 12 is out of support](../rules/npm.package.next.12.support-end.html) | End of support | 2023-10-26 | `vers:npm/>=12.0.0\|<13.0.0` | [Next.js support policy](https://nextjs.org/support-policy), [Next.js upgrade guide: version 13](https://nextjs.org/docs/pages/building-your-application/upgrading/version-13), [Next.js upgrade guide: version 14](https://nextjs.org/docs/app/building-your-application/upgrading/version-14), [Next.js upgrade guide: version 15](https://nextjs.org/docs/app/guides/upgrading/version-15), [Next.js upgrade guide: version 16](https://nextjs.org/docs/app/guides/upgrading/version-16) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/next.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/next.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Next.js end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Next.js has releases that are out of support. Next.js 15 is out of support as of 2026-10-21. This page lists 4 reviewed lifecycle rules for pkg:npm/next, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check Next.js?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:npm/next."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the Next.js dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
