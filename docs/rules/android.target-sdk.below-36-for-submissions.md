---
title: "Google Play requires new apps and updates to target API 36 or higher — dates, impact, migration"
description: "Starting 2026-08-31, Google Play requires new apps and app updates to target Android 16 (API level 36) or higher."
canonical_url: "https://arminazimi.github.io/evergreen/rules/android.target-sdk.below-36-for-submissions.html"
---

# Google Play requires new apps and updates to target API 36 or higher

Starting 2026-08-31, Google Play requires new apps and app updates to target Android 16 (API level 36) or higher. Targeting API 35 meets the existing-app availability floor but does not meet the submission requirement for new apps and updates (Wear OS, Android Automotive OS, Android TV, and Android XR have separate floors on that page).

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `android` |
| Component | `pkg:generic/android/targetSdk` |
| Affected versions | `vers:intdot/>=35\|<36` |
| Date from the source | 2026-08-31 |
| Replacement | targetSdk 36 or higher |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi |
| Review due | 2027-01-17 (90 days after the last review) |
| Rule ID | `android.target-sdk.below-36-for-submissions` |

## Sources

- [Meet Google Play's target API level requirement](https://developer.android.com/google/play/requirements/target-sdk)

## Detected by

No built-in detector reads `android` declarations yet; the rule is data in the [lifecycle registry](https://github.com/arminazimi/evergreen/blob/main/registry/android.json).

## Data

This page is generated from [`registry/android.json`](https://github.com/arminazimi/evergreen/blob/main/registry/android.json), rule `android.target-sdk.below-36-for-submissions`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/android.target-sdk.below-36-for-submissions.html",
  "url": "https://arminazimi.github.io/evergreen/rules/android.target-sdk.below-36-for-submissions.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/android.target-sdk.below-36-for-submissions.html",
  "headline": "Google Play requires new apps and updates to target API 36 or higher — dates, impact, migration",
  "description": "Starting 2026-08-31, Google Play requires new apps and app updates to target Android 16 (API level 36) or higher.",
  "inLanguage": "en",
  "dateModified": "2026-10-19",
  "keywords": [
    "end-of-support",
    "android",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Google Play requires new apps and updates to target API 36 or higher",
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
