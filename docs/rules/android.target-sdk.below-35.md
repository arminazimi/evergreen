---
title: "Google Play requires existing apps to target API 35 or higher — dates, impact, migration"
description: "Starting 2026-08-31, Google Play requires existing apps to target Android 15 (API level 35) or higher to remain available to new users on devices running a newer Android OS than the app's target API…"
canonical_url: "https://arminazimi.github.io/evergreen/rules/android.target-sdk.below-35.html"
---

# Google Play requires existing apps to target API 35 or higher

Starting 2026-08-31, Google Play requires existing apps to target Android 15 (API level 35) or higher to remain available to new users on devices running a newer Android OS than the app's target API level. Apps that target API 34 or lower are limited to devices running the same or a lower Android OS version.

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `android` |
| Component | `pkg:generic/android/targetSdk` |
| Affected versions | `vers:intdot/<35` |
| Date from the source | 2026-08-31 |
| Replacement | targetSdk 35 or higher (API 36 for new apps and updates) |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi |
| Review due | 2027-01-17 (90 days after the last review) |
| Rule ID | `android.target-sdk.below-35` |

## Sources

- [Meet Google Play's target API level requirement](https://developer.android.com/google/play/requirements/target-sdk)

## Detected by

No built-in detector reads `android` declarations yet; the rule is data in the [lifecycle registry](https://github.com/arminazimi/evergreen/blob/main/registry/android.json).

## Data

This page is generated from [`registry/android.json`](https://github.com/arminazimi/evergreen/blob/main/registry/android.json), rule `android.target-sdk.below-35`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/android.target-sdk.below-35.html",
  "url": "https://arminazimi.github.io/evergreen/rules/android.target-sdk.below-35.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/android.target-sdk.below-35.html",
  "headline": "Google Play requires existing apps to target API 35 or higher — dates, impact, migration",
  "description": "Starting 2026-08-31, Google Play requires existing apps to target Android 15 (API level 35) or higher to remain available to new users on devices running a newer Android OS than the app's target API…",
  "inLanguage": "en",
  "dateModified": "2026-10-19",
  "keywords": [
    "end-of-support",
    "android",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Google Play requires existing apps to target API 35 or higher",
    "identifier": "pkg:generic/android/targetSdk"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Meet Google Play's target API level requirement",
      "url": "https://developer.android.com/google/play/requirements/target-sdk"
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
