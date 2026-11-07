---
title: "Dart 3.4 no longer receives security updates — dates, impact, migration"
description: "The Dart security policy commits security updates only for the most recent stable SDK release. Dart 3.4 stopped being that release when Dart 3.5 shipped on 2024-08-07."
layout: doc
permalink: "/rules/dart.sdk.end-of-support-3.4.html"
canonical_url: "https://arminazimi.github.io/evergreen/rules/dart.sdk.end-of-support-3.4.html"
image: "/assets/og/dart.sdk.end-of-support-3.4.svg"
review_date: "2026-11-07"
last_modified_at: "2026-11-07"
json_twin: "/rules/dart.sdk.end-of-support-3.4.json"
---

# Dart 3.4 no longer receives security updates

**End of support** as of 2024-08-07. Replacement: Dart 3.13 or later. Source: [Dart security policy](https://dart.dev/security).

Check a version:

```bash
evergreen check pkg:generic/dart
```

The Dart security policy commits security updates only for the most recent stable SDK release. Dart 3.4 stopped being that release when Dart 3.5 shipped on 2024-08-07.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `dart` |
| Component | `pkg:generic/dart` |
| Affected versions | `vers:semver/>=3.4.0\|<3.5.0` |
| Date from the source | 2024-08-07 |
| Replacement | Dart 3.13 or later |
| Evidence last seen | 2026-11-07 |
| Reviewed | 2026-11-07 by arminazimi |
| Review due | 2027-02-05 (90 days after the last review) |
| Rule ID | `dart.sdk.end-of-support-3.4` |

## Sources

- [Dart security policy](https://dart.dev/security) (accessed 2026-11-07)
- [Dart changelog](https://dart.dev/changelog) (accessed 2026-11-07)

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

## Related

### Other versions of this product

- [Dart 2 and older no longer receive security updates](dart.sdk.end-of-support-2-and-older.html)
- [Dart 3.0 no longer receives security updates](dart.sdk.end-of-support-3.0.html)
- [Dart 3.1 no longer receives security updates](dart.sdk.end-of-support-3.1.html)
- [Dart 3.10 no longer receives security updates](dart.sdk.end-of-support-3.10.html)
- [Dart 3.11 no longer receives security updates](dart.sdk.end-of-support-3.11.html)
- [Dart 3.12 no longer receives security updates](dart.sdk.end-of-support-3.12.html)
- [Dart 3.2 no longer receives security updates](dart.sdk.end-of-support-3.2.html)
- [Dart 3.3 no longer receives security updates](dart.sdk.end-of-support-3.3.html)
- [Dart 3.5 no longer receives security updates](dart.sdk.end-of-support-3.5.html)
- [Dart 3.6 no longer receives security updates](dart.sdk.end-of-support-3.6.html)
- [Dart 3.7 no longer receives security updates](dart.sdk.end-of-support-3.7.html)
- [Dart 3.8 no longer receives security updates](dart.sdk.end-of-support-3.8.html)

### Same ecosystem

- [analysis_server_client is discontinued on pub.dev](dart.package.analysis-server-client.discontinued.html)
- [Dart 3.9 no longer receives security updates](dart.sdk.end-of-support-3.9.html)


## Data

This page is generated from [`registry/dart.json`](https://github.com/arminazimi/evergreen/blob/main/registry/dart.json), rule `dart.sdk.end-of-support-3.4`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/dart.sdk.end-of-support-3.4.html",
      "url": "https://arminazimi.github.io/evergreen/rules/dart.sdk.end-of-support-3.4.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/dart.sdk.end-of-support-3.4.html",
      "headline": "Dart 3.4 no longer receives security updates — dates, impact, migration",
      "description": "The Dart security policy commits security updates only for the most recent stable SDK release. Dart 3.4 stopped being that release when Dart 3.5 shipped on 2024-08-07.",
      "inLanguage": "en",
      "dateModified": "2026-11-07",
      "keywords": [
        "end-of-support",
        "dart",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "Dart 3.4 no longer receives security updates",
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
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/dart.sdk.end-of-support-3.4.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/dart.sdk.end-of-support-3.4.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/dart?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of support as of 2024-08-07. Affected versions: vers:semver/>=3.4.0|\u003c3.5.0. Source: Dart security policy (https://dart.dev/security)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/dart?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Dart 3.13 or later"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/dart?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/dart."
          }
        }
      ]
    }
  ]
}
</script>
