---
title: "Dart 3.10 no longer receives security updates — dates, impact, migration"
description: "The Dart security policy commits security updates only for the most recent stable SDK release. Dart 3.10 stopped being that release when Dart 3.11 shipped on 2026-02-11."
canonical_url: "https://arminazimi.github.io/evergreen/rules/dart.sdk.end-of-support-3.10.html"
---

# Dart 3.10 no longer receives security updates

The Dart security policy commits security updates only for the most recent stable SDK release. Dart 3.10 stopped being that release when Dart 3.11 shipped on 2026-02-11.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `dart` |
| Component | `pkg:generic/dart` |
| Affected versions | `vers:semver/>=3.10.0\|<3.11.0` |
| Date from the source | 2026-02-11 |
| Replacement | Dart 3.13 or later |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-01-19 (90 days after the last review) |
| Rule ID | `dart.sdk.end-of-support-3.10` |

## Sources

- [Dart security policy](https://dart.dev/security)
- [Dart changelog](https://dart.dev/changelog)

## Migration

**Constraints**

- Keep environment.sdk in pubspec.yaml, the sdks block in pubspec.lock, the Flutter version pinned in .fvmrc, and the SDK used in CI on one supported release.
- A Flutter project gets its Dart SDK from the Flutter release it pins, so raise the Flutter pin to a release that bundles the Dart version in the replacement instead of installing Dart on its own.

**Steps**

1. **Raise the SDK pin.** Change the reported Dart SDK pin to the version in the replacement. For a Flutter project, raise the Flutter version in .fvmrc or .fvm/fvm_config.json to a release that bundles that Dart version.
2. **Raise the SDK constraint.** Raise the lower bound of environment.sdk in pubspec.yaml (and environment.flutter for an app) so it admits only supported SDKs, then re-resolve dependencies so pubspec.lock records the new sdks constraints.
3. **Align CI and documentation.** Update CI workflows, Docker images, and setup documentation that install the Dart or Flutter SDK so they match the new pin.

**Verification**

- `dart --version`: Confirm the active Dart SDK is the intended release.
- `dart pub get`: Re-resolve dependencies against the new SDK constraint.
- `dart analyze && flutter test`: Analyze and test a Flutter app on the new SDK.
- `dart analyze && dart test`: Analyze and test a Dart package on the new SDK.

## Detected by

The `dart` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/dart.json`](https://github.com/arminazimi/evergreen/blob/main/registry/dart.json), rule `dart.sdk.end-of-support-3.10`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/dart.sdk.end-of-support-3.10.html",
  "url": "https://arminazimi.github.io/evergreen/rules/dart.sdk.end-of-support-3.10.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/dart.sdk.end-of-support-3.10.html",
  "headline": "Dart 3.10 no longer receives security updates — dates, impact, migration",
  "description": "The Dart security policy commits security updates only for the most recent stable SDK release. Dart 3.10 stopped being that release when Dart 3.11 shipped on 2026-02-11.",
  "inLanguage": "en",
  "dateModified": "2026-10-21",
  "keywords": [
    "end-of-support",
    "dart",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Dart 3.10 no longer receives security updates",
    "identifier": "pkg:generic/dart"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Dart security policy",
      "url": "https://dart.dev/security"
    },
    {
      "@type": "CreativeWork",
      "name": "Dart changelog",
      "url": "https://dart.dev/changelog"
    }
  ],
  "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/dart.json",
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen"
  }
}
</script>
