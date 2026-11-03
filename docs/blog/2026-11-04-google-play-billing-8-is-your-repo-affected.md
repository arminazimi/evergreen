---
title: "Is your repo affected? Google Play Billing Library 8 reaches its update deadline on 2027-08-31"
---

# Is your repo affected? Google Play Billing Library 8 reaches its update deadline on 2027-08-31

The Google Play Billing Library version deprecation page states that all versions have a two-year deprecation cycle. Its support timeline lists **version 8** with a new app and update deadline of **August 31, 2027** and an extension deadline of **November 1, 2027**. The reviewed rule behind this post tracks the 2027-08-31 deadline for any `com.android.billingclient:billing` 8.x dependency.

## Who is affected

Android app repositories that declare a literal string-notation `com.android.billingclient:billing` dependency in the 8.0.0-to-9.0.0 range in a `build.gradle` or `build.gradle.kts` file. The `android` detector reads those declarations, alongside the SDK and plugin pins described in [Android compatibility](../compatibility/android.md#android-detector), and matches each one to its rule. Gradle is never run and nothing is fetched during a scan.

## Check your repository

```bash
npx evergreen-deprecation scan
```

Look for rule `android.play-billing.version-8`.

## Migration steps

Replacement: Google Play Billing Library 9.x or later.

1. **Raise the Play Billing Library dependency.** Change the reported `com.android.billingclient:billing` version to 9.x or later in the `build.gradle`/`build.gradle.kts` dependency, or in the version catalog key that supplies it.
2. **Align other Play Billing declarations.** Update every other Gradle module, `libs.versions.toml` entry, and dependency-management block that still pins the 8.x major.
3. **Read the migration guide for the jump.** A major upgrade of `com.android.billingclient:billing` can require BillingClient API changes; work through the Play Billing Library migration guide for the jump from the reported major to the replacement before shipping.

Then verify with `./gradlew assembleDebug` and `./gradlew dependencies`, which confirms the resolved Play Billing Library major matches the intended replacement. Full constraints and verification commands are on the [rule page](../rules/android.play-billing.version-8.md).

## Sources

- [Google Play Billing Library version deprecation — support timeline](https://developer.android.com/google/play/billing/deprecation-faq)
- Rules: [`android.play-billing.version-8`](../rules/android.play-billing.version-8.md)

Every claim above comes from the linked source and the reviewed rule. The [lifecycle calendar](../EOL_CALENDAR.md) lists what ends next.
