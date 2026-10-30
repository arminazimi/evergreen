---
title: "Is Dart end of life? — versions, dates, sources"
description: "Dart has releases that are out of support. Dart 3.12 no longer receives security updates as of 2026-08-12."
canonical_url: "https://arminazimi.github.io/evergreen/eol/dart.html"
---

# Is Dart end of life?

**Dart has releases that are out of support.** Dart 3.12 no longer receives security updates as of 2026-08-12. This page lists 5 reviewed lifecycle rules for `pkg:generic/dart`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:generic/dart
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [Dart 3.12 no longer receives security updates](../rules/dart.sdk.end-of-support-3.12.html) | End of support | 2026-08-12 | `vers:semver/>=3.12.0\|<3.13.0` | [Dart security policy](https://dart.dev/security), [Dart changelog](https://dart.dev/changelog) |
| [Dart 3.11 no longer receives security updates](../rules/dart.sdk.end-of-support-3.11.html) | End of support | 2026-05-18 | `vers:semver/>=3.11.0\|<3.12.0` | [Dart security policy](https://dart.dev/security), [Dart changelog](https://dart.dev/changelog) |
| [Dart 3.10 no longer receives security updates](../rules/dart.sdk.end-of-support-3.10.html) | End of support | 2026-02-11 | `vers:semver/>=3.10.0\|<3.11.0` | [Dart security policy](https://dart.dev/security), [Dart changelog](https://dart.dev/changelog) |
| [Dart 3.9 no longer receives security updates](../rules/dart.sdk.end-of-support-3.9.html) | End of support | 2025-11-12 | `vers:semver/>=3.9.0\|<3.10.0` | [Dart security policy](https://dart.dev/security), [Dart changelog](https://dart.dev/changelog) |
| [Dart 3.8 no longer receives security updates](../rules/dart.sdk.end-of-support-3.8.html) | End of support | 2025-08-13 | `vers:semver/>=3.8.0\|<3.9.0` | [Dart security policy](https://dart.dev/security), [Dart changelog](https://dart.dev/changelog) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/dart.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/dart.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Dart end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Dart has releases that are out of support. Dart 3.12 no longer receives security updates as of 2026-08-12. This page lists 5 reviewed lifecycle rules for pkg:generic/dart, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check Dart?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:generic/dart."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the Dart dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
