---
title: "Google Play requires targetSdk 35+ for existing phone and tablet apps — dates, impact, migration"
description: "The Google Play target API level requirement page states, starting 2026-08-31: Existing apps must target Android 15 (API level 35) or higher to remain available to new users on devices running…"
canonical_url: "https://arminazimi.github.io/evergreen/rules/android.target-sdk.existing.default-below-35.html"
json_twin: "/rules/android.target-sdk.existing.default-below-35.json"
---

# Google Play requires targetSdk 35+ for existing phone and tablet apps

**End of support** as of 2026-08-31. Replacement: targetSdk 35 or higher (existing apps (availability to new users on newer OS versions); default (phone and tablet) apps). Source: [Meet Google Play's target API level requirement](https://developer.android.com/google/play/requirements/target-sdk).

Check a version:

```bash
evergreen check pkg:generic/android/targetSdk
```

The Google Play target API level requirement page states, starting 2026-08-31: Existing apps must target Android 15 (API level 35) or higher to remain available to new users on devices running Android OS higher than your app's target API level. Apps that target Android 14 (API level 34) or lower, including Android 13 (API level 33) or lower for Wear OS, Android TV, and Android XR, and Android 12 (API level 31) or lower for Android Automotive OS, The same page says an extension to 2026-11-01 may be requested.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `android` |
| Component | `pkg:generic/android/targetSdk` |
| Affected versions | `vers:intdot/<35` |
| Date from the source | 2026-08-31 |
| Replacement | targetSdk 35 or higher (existing apps (availability to new users on newer OS versions); default (phone and tablet) apps) |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-30 by arminazimi, drafted by the `android-1` importer |
| Review due | 2027-01-28 (90 days after the last review) |
| Rule ID | `android.target-sdk.existing.default-below-35` |

## Sources

- [Meet Google Play's target API level requirement](https://developer.android.com/google/play/requirements/target-sdk) (accessed 2026-10-30)

## Migration

**Constraints**

- This floor applies to existing apps distributed on Google Play for default (phone and tablet) form factors; Wear OS, Android TV, Android XR, Android Automotive OS, and permanently private internal apps follow different Play requirements.
- Raising targetSdk can change platform behavior; read the Android 15 behavior-changes documentation before shipping.

**Steps**

1. **Raise targetSdk to 35 or higher.** Change the reported targetSdk in build.gradle(.kts) (or the version-catalog key or variable that supplies it) to 35 or higher.
2. **Align other targetSdk declarations.** Update every other module defaultConfig, product flavor, and version-catalog key that still pins a targetSdk below 35.

**Verification**

- `./gradlew assembleDebug`: Build a debug APK with the raised targetSdk.

## Detected by

The `android` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/android.json`](https://github.com/arminazimi/evergreen/blob/main/registry/android.json), rule `android.target-sdk.existing.default-below-35`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/android.target-sdk.existing.default-below-35.html",
      "url": "https://arminazimi.github.io/evergreen/rules/android.target-sdk.existing.default-below-35.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/android.target-sdk.existing.default-below-35.html",
      "headline": "Google Play requires targetSdk 35+ for existing phone and tablet apps — dates, impact, migration",
      "description": "The Google Play target API level requirement page states, starting 2026-08-31: Existing apps must target Android 15 (API level 35) or higher to remain available to new users on devices running…",
      "inLanguage": "en",
      "dateModified": "2026-10-30",
      "keywords": [
        "end-of-support",
        "android",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "Google Play requires targetSdk 35+ for existing phone and tablet apps",
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
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/android.target-sdk.existing.default-below-35.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/android.target-sdk.existing.default-below-35.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/android/targetSdk?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of support as of 2026-08-31. Affected versions: vers:intdot/\u003c35. Source: Meet Google Play's target API level requirement (https://developer.android.com/google/play/requirements/target-sdk)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/android/targetSdk?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "targetSdk 35 or higher (existing apps (availability to new users on newer OS versions); default (phone and tablet) apps)"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/android/targetSdk?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/android/targetSdk."
          }
        }
      ]
    }
  ]
}
</script>
