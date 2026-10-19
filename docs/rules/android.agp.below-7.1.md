---
title: "Android Gradle Plugin below 7.1 is outside current Android Studio support — dates, impact, migration"
description: "Google's Android Gradle Plugin and Android Studio compatibility table lists current Android Studio releases (including Rabbit 1 and Quail 4) as supporting AGP 7.1 through 9.4."
canonical_url: "https://arminazimi.github.io/evergreen/rules/android.agp.below-7.1.html"
---

# Android Gradle Plugin below 7.1 is outside current Android Studio support

Google's Android Gradle Plugin and Android Studio compatibility table lists current Android Studio releases (including Rabbit 1 and Quail 4) as supporting AGP 7.1 through 9.4. AGP versions older than 7.1.0 are outside that supported range. The same page states Android Studio supports AGP versions released within the previous three years and that incompatible AGP versions must be updated.

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `android` |
| Component | `pkg:maven/com.android.tools.build/gradle` |
| Affected versions | `vers:maven/<7.1.0` |
| Date from the source | The source gives no day |
| Replacement | Android Gradle Plugin 8.x or 9.x within the Studio support range for your IDE |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi |
| Review due | 2027-01-17 (90 days after the last review) |
| Rule ID | `android.agp.below-7.1` |

## Sources

- [About Android Gradle plugin — Android Studio compatibility](https://developer.android.com/build/releases/about-agp)

## Detected by

No built-in detector reads `android` declarations yet; the rule is data in the [lifecycle registry](https://github.com/arminazimi/evergreen/blob/main/registry/android.json).

## Data

This page is generated from [`registry/android.json`](https://github.com/arminazimi/evergreen/blob/main/registry/android.json), rule `android.agp.below-7.1`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/android.agp.below-7.1.html",
  "url": "https://arminazimi.github.io/evergreen/rules/android.agp.below-7.1.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/android.agp.below-7.1.html",
  "headline": "Android Gradle Plugin below 7.1 is outside current Android Studio support — dates, impact, migration",
  "description": "Google's Android Gradle Plugin and Android Studio compatibility table lists current Android Studio releases (including Rabbit 1 and Quail 4) as supporting AGP 7.1 through 9.4.",
  "inLanguage": "en",
  "dateModified": "2026-10-19",
  "keywords": [
    "end-of-support",
    "android",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Android Gradle Plugin below 7.1 is outside current Android Studio support",
    "identifier": "pkg:maven/com.android.tools.build/gradle"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "About Android Gradle plugin — Android Studio compatibility",
      "url": "https://developer.android.com/build/releases/about-agp"
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
