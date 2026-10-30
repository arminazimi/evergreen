---
title: "Google Play Billing Library 6 is past its deprecation deadline — dates, impact, migration"
description: "The Google Play Billing Library version deprecation page states that all versions have a two-year deprecation cycle."
canonical_url: "https://arminazimi.github.io/evergreen/rules/android.play-billing.version-6.html"
---

# Google Play Billing Library 6 is past its deprecation deadline

**Deprecated** as of 2025-08-31. Replacement: Google Play Billing Library 8.x or 9.x. Source: [Google Play Billing Library version deprecation — support timeline](https://developer.android.com/google/play/billing/deprecation-faq).

Check a version:

```bash
evergreen check pkg:maven/com.android.billingclient/billing
```

The Google Play Billing Library version deprecation page states that all versions have a two-year deprecation cycle. Its support timeline table lists version 6 with a new app and update deadline of August 31, 2025 and an extension deadline of November 1, 2025.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | high |
| Ecosystem | `android` |
| Component | `pkg:maven/com.android.billingclient/billing` |
| Affected versions | `vers:maven/>=6.0.0\|<7.0.0` |
| Date from the source | 2025-08-31 |
| Replacement | Google Play Billing Library 8.x or 9.x |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi |
| Review due | 2027-01-17 (90 days after the last review) |
| Rule ID | `android.play-billing.version-6` |

## Sources

- [Google Play Billing Library version deprecation — support timeline](https://developer.android.com/google/play/billing/deprecation-faq) (accessed 2026-10-19)

## Migration

**Constraints**

- Keep every module, version catalog entry, and BOM override on one Play Billing Library major that Google Play still accepts for new apps and updates.
- Major upgrades of com.android.billingclient:billing can require BillingClient API changes; read the Play Billing Library migration guide for the jump from the reported major to the replacement before shipping.

**Steps**

1. **Raise the Play Billing Library dependency.** Change the reported com.android.billingclient:billing version to Google Play Billing Library 8.x or 9.x (see the replacement) in the build.gradle(.kts) dependency (or the version catalog key that supplies it).
2. **Align other Play Billing declarations.** Update every other Gradle module, libs.versions.toml entry, and dependency-management block that still pins the old major, and adjust BillingClient call sites the migration guide names for that jump.

**Verification**

- `./gradlew assembleDebug`: Build a debug APK with the raised Play Billing Library major.
- `./gradlew dependencies`: Confirm the resolved Play Billing Library major matches the intended replacement.

## Detected by

The `android` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/android.json`](https://github.com/arminazimi/evergreen/blob/main/registry/android.json), rule `android.play-billing.version-6`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/android.play-billing.version-6.html",
  "url": "https://arminazimi.github.io/evergreen/rules/android.play-billing.version-6.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/android.play-billing.version-6.html",
  "headline": "Google Play Billing Library 6 is past its deprecation deadline — dates, impact, migration",
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
    "name": "Google Play Billing Library 6 is past its deprecation deadline",
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
