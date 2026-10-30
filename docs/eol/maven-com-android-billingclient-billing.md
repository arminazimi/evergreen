---
title: "Is Google Play Billing end of life? — versions, dates, sources"
description: "Google Play Billing has a scheduled end of life. Google Play Billing Library 9 reaches its new-app and update deadline on 2028-08-31."
canonical_url: "https://arminazimi.github.io/evergreen/eol/maven-com-android-billingclient-billing.html"
---

# Is Google Play Billing end of life?

**Google Play Billing has a scheduled end of life.** Google Play Billing Library 9 reaches its new-app and update deadline on 2028-08-31. This page lists 5 reviewed lifecycle rules for `pkg:maven/com.android.billingclient/billing`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:maven/com.android.billingclient/billing
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [Google Play Billing Library 9 reaches its new-app and update deadline on 2028-08-31](../rules/android.play-billing.version-9.html) | Scheduled end of life | 2028-08-31 | `vers:maven/>=9.0.0\|<10.0.0` | [Google Play Billing Library version deprecation — support timeline](https://developer.android.com/google/play/billing/deprecation-faq) |
| [Google Play Billing Library 8 reaches its new-app and update deadline on 2027-08-31](../rules/android.play-billing.version-8.html) | Scheduled end of life | 2027-08-31 | `vers:maven/>=8.0.0\|<9.0.0` | [Google Play Billing Library version deprecation — support timeline](https://developer.android.com/google/play/billing/deprecation-faq) |
| [Google Play Billing Library 7 is past its deprecation deadline](../rules/android.play-billing.version-7.html) | Deprecated | 2026-08-31 | `vers:maven/>=7.0.0\|<8.0.0` | [Google Play Billing Library version deprecation — support timeline](https://developer.android.com/google/play/billing/deprecation-faq) |
| [Google Play Billing Library 6 is past its deprecation deadline](../rules/android.play-billing.version-6.html) | Deprecated | 2025-08-31 | `vers:maven/>=6.0.0\|<7.0.0` | [Google Play Billing Library version deprecation — support timeline](https://developer.android.com/google/play/billing/deprecation-faq) |
| [Google Play Billing Library 5 is past its deprecation deadline](../rules/android.play-billing.version-5.html) | Deprecated | 2024-08-31 | `vers:maven/>=5.0.0\|<6.0.0` | [Google Play Billing Library version deprecation — support timeline](https://developer.android.com/google/play/billing/deprecation-faq) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/maven-com-android-billingclient-billing.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/maven-com-android-billingclient-billing.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Google Play Billing end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Google Play Billing has a scheduled end of life. Google Play Billing Library 9 reaches its new-app and update deadline on 2028-08-31. This page lists 5 reviewed lifecycle rules for pkg:maven/com.android.billingclient/billing, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check Google Play Billing?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:maven/com.android.billingclient/billing."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the Google Play Billing dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
