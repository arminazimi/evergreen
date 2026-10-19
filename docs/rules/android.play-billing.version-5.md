---
title: "Google Play Billing Library 5 is past its deprecation deadline — dates, impact, migration"
description: "The Google Play Billing Library version deprecation page states that all versions have a two-year deprecation cycle."
canonical_url: "https://arminazimi.github.io/evergreen/rules/android.play-billing.version-5.html"
---

# Google Play Billing Library 5 is past its deprecation deadline

The Google Play Billing Library version deprecation page states that all versions have a two-year deprecation cycle. Its support timeline table lists version 5 with a new app and update deadline of August 31, 2024 and an extension deadline of November 1, 2024.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | high |
| Ecosystem | `android` |
| Component | `pkg:maven/com.android.billingclient/billing` |
| Affected versions | `vers:maven/>=5.0.0\|<6.0.0` |
| Date from the source | 2024-08-31 |
| Replacement | Google Play Billing Library 8.x or 9.x |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi |
| Review due | 2027-01-17 (90 days after the last review) |
| Rule ID | `android.play-billing.version-5` |

## Sources

- [Google Play Billing Library version deprecation — support timeline](https://developer.android.com/google/play/billing/deprecation-faq)

## Detected by

No built-in detector reads `android` declarations yet; the rule is data in the [lifecycle registry](https://github.com/arminazimi/evergreen/blob/main/registry/android.json).

## Data

This page is generated from [`registry/android.json`](https://github.com/arminazimi/evergreen/blob/main/registry/android.json), rule `android.play-billing.version-5`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/android.play-billing.version-5.html",
  "url": "https://arminazimi.github.io/evergreen/rules/android.play-billing.version-5.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/android.play-billing.version-5.html",
  "headline": "Google Play Billing Library 5 is past its deprecation deadline — dates, impact, migration",
  "description": "The Google Play Billing Library version deprecation page states that all versions have a two-year deprecation cycle.",
  "inLanguage": "en",
  "dateModified": "2026-10-19",
  "keywords": [
    "deprecated",
    "android",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Google Play Billing Library 5 is past its deprecation deadline",
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
