---
title: "Android Gradle Plugin below 8.9.1 is below Google's minimum for API 36 — dates, impact, migration"
description: "Google's table of minimum tool versions for Android API levels lists API level 36 as requiring Android Gradle Plugin 8.9.1 or higher."
canonical_url: "https://arminazimi.github.io/evergreen/rules/android.agp.below-8.9.1-for-api-36.html"
---

# Android Gradle Plugin below 8.9.1 is below Google's minimum for API 36

Google's table of minimum tool versions for Android API levels lists API level 36 as requiring Android Gradle Plugin 8.9.1 or higher. AGP versions from 8.6.0 up to but not including 8.9.1 meet the API 35 tool minimum but are below the documented minimum for API 36, which Google Play requires for new apps and app updates as of 2026-08-31.

| | |
| --- | --- |
| Status | End of support |
| Severity | medium |
| Ecosystem | `android` |
| Component | `pkg:maven/com.android.tools.build/gradle` |
| Affected versions | `vers:maven/>=8.6.0\|<8.9.1` |
| Date from the source | The source gives no day |
| Replacement | Android Gradle Plugin 8.9.1 or higher (9.x is current stable) |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi |
| Review due | 2027-01-17 (90 days after the last review) |
| Rule ID | `android.agp.below-8.9.1-for-api-36` |

## Sources

- [About Android Gradle plugin — Minimum versions of tools for Android API level](https://developer.android.com/build/releases/about-agp)
- [Meet Google Play's target API level requirement](https://developer.android.com/google/play/requirements/target-sdk)

## Detected by

No built-in detector reads `android` declarations yet; the rule is data in the [lifecycle registry](https://github.com/arminazimi/evergreen/blob/main/registry/android.json).

## Data

This page is generated from [`registry/android.json`](https://github.com/arminazimi/evergreen/blob/main/registry/android.json), rule `android.agp.below-8.9.1-for-api-36`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/android.agp.below-8.9.1-for-api-36.html",
  "url": "https://arminazimi.github.io/evergreen/rules/android.agp.below-8.9.1-for-api-36.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/android.agp.below-8.9.1-for-api-36.html",
  "headline": "Android Gradle Plugin below 8.9.1 is below Google's minimum for API 36 — dates, impact, migration",
  "description": "Google's table of minimum tool versions for Android API levels lists API level 36 as requiring Android Gradle Plugin 8.9.1 or higher.",
  "inLanguage": "en",
  "dateModified": "2026-10-19",
  "keywords": [
    "end-of-support",
    "android",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "Android Gradle Plugin below 8.9.1 is below Google's minimum for API 36",
    "identifier": "pkg:maven/com.android.tools.build/gradle"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "About Android Gradle plugin — Minimum versions of tools for Android API level",
      "url": "https://developer.android.com/build/releases/about-agp"
    },
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
