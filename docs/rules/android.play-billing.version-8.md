---
title: "Google Play Billing Library 8 reaches its new-app and update deadline on 2027-08-31 — dates, impact, migration"
description: "The Google Play Billing Library version deprecation page states that all versions have a two-year deprecation cycle."
canonical_url: "https://arminazimi.github.io/evergreen/rules/android.play-billing.version-8.html"
---

# Google Play Billing Library 8 reaches its new-app and update deadline on 2027-08-31

The Google Play Billing Library version deprecation page states that all versions have a two-year deprecation cycle. Its support timeline table lists version 8 with a new app and update deadline of August 31, 2027 and an extension deadline of November 1, 2027.

| | |
| --- | --- |
| Status | Scheduled end of life |
| Severity | low |
| Ecosystem | `android` |
| Component | `pkg:maven/com.android.billingclient/billing` |
| Affected versions | `vers:maven/>=8.0.0\|<9.0.0` |
| Date from the source | 2027-08-31 |
| Replacement | Google Play Billing Library 9.x or later |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi |
| Review due | 2027-01-17 (90 days after the last review) |
| Rule ID | `android.play-billing.version-8` |

## Sources

- [Google Play Billing Library version deprecation — support timeline](https://developer.android.com/google/play/billing/deprecation-faq)

## Detected by

The `android` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/android.json`](https://github.com/arminazimi/evergreen/blob/main/registry/android.json), rule `android.play-billing.version-8`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/android.play-billing.version-8.html",
  "url": "https://arminazimi.github.io/evergreen/rules/android.play-billing.version-8.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/android.play-billing.version-8.html",
  "headline": "Google Play Billing Library 8 reaches its new-app and update deadline on 2027-08-31 — dates, impact, migration",
  "description": "The Google Play Billing Library version deprecation page states that all versions have a two-year deprecation cycle.",
  "inLanguage": "en",
  "dateModified": "2026-10-19",
  "keywords": [
    "scheduled-end-of-life",
    "android",
    "low"
  ],
  "about": {
    "@type": "Thing",
    "name": "Google Play Billing Library 8 reaches its new-app and update deadline on 2027-08-31",
    "identifier": "pkg:maven/com.android.billingclient/billing"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Google Play Billing Library version deprecation — support timeline",
      "url": "https://developer.android.com/google/play/billing/deprecation-faq"
    }
  ],
  "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/android.json",
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen"
  }
}
</script>
