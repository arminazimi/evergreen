---
title: "Dart 3.11 no longer receives security updates — dates, impact, migration"
description: "The Dart security policy commits security updates only for the most recent stable SDK release. Dart 3.11 stopped being that release when Dart 3.12 shipped on 2026-05-18."
canonical_url: "https://arminazimi.github.io/evergreen/rules/dart.sdk.end-of-support-3.11.html"
---

# Dart 3.11 no longer receives security updates

The Dart security policy commits security updates only for the most recent stable SDK release. Dart 3.11 stopped being that release when Dart 3.12 shipped on 2026-05-18.

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `dart` |
| Component | `pkg:generic/dart` |
| Affected versions | `vers:semver/>=3.11.0\|<3.12.0` |
| Date from the source | 2026-05-18 |
| Replacement | Dart 3.13 or later |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-01-19 (90 days after the last review) |
| Rule ID | `dart.sdk.end-of-support-3.11` |

## Sources

- [Dart security policy](https://dart.dev/security)
- [Dart changelog](https://dart.dev/changelog)

## Detected by

The `dart` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/dart.json`](https://github.com/arminazimi/evergreen/blob/main/registry/dart.json), rule `dart.sdk.end-of-support-3.11`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/dart.sdk.end-of-support-3.11.html",
  "url": "https://arminazimi.github.io/evergreen/rules/dart.sdk.end-of-support-3.11.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/dart.sdk.end-of-support-3.11.html",
  "headline": "Dart 3.11 no longer receives security updates — dates, impact, migration",
  "description": "The Dart security policy commits security updates only for the most recent stable SDK release. Dart 3.11 stopped being that release when Dart 3.12 shipped on 2026-05-18.",
  "inLanguage": "en",
  "dateModified": "2026-10-21",
  "keywords": [
    "end-of-support",
    "dart",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Dart 3.11 no longer receives security updates",
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
