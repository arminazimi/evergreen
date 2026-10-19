---
title: "Xcode 15 is not accepted for App Store uploads — dates, impact, migration"
description: "Since April 24, 2025, apps uploaded to App Store Connect must be built with Xcode 16 or later using an SDK for iOS 18, iPadOS 18, tvOS 18, visionOS 2, or watchOS 11."
canonical_url: "https://arminazimi.github.io/evergreen/rules/swift.xcode.app-store-15.html"
---

# Xcode 15 is not accepted for App Store uploads

Since April 24, 2025, apps uploaded to App Store Connect must be built with Xcode 16 or later using an SDK for iOS 18, iPadOS 18, tvOS 18, visionOS 2, or watchOS 11. Xcode 15 no longer meets that requirement.

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `swift` |
| Component | `pkg:generic/xcode` |
| Affected versions | `vers:semver/>=15.0.0\|<16.0.0` |
| Date from the source | 2025-04-24 |
| Replacement | Xcode 26 or later |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi |
| Review due | 2027-01-17 (90 days after the last review) |
| Rule ID | `swift.xcode.app-store-15` |

## Sources

- [SDK minimum requirements — App Store upcoming requirements (Xcode 16)](https://developer.apple.com/news/upcoming-requirements/?id=02212025a)

## Migration

**Constraints**

- Keep .xcode-version, CI Xcode selections, and local installs on one Xcode release that App Store Connect still accepts.
- Later App Store SDK minimums also require newer Xcode lines; plan to land on the current minimum (see the replacement).

**Steps**

1. **Raise the Xcode pin.** Change the reported .xcode-version (or equivalent CI Xcode version) from Xcode 15 to a release App Store Connect accepts (see the replacement).
2. **Align other Xcode surfaces.** Update CI macOS/Xcode images and documented install steps so they match the new pin.

**Verification**

- `xcodebuild -version`: Confirm the active Xcode is the intended release.
- `xcodebuild -scheme "$(basename "$PWD")" -destination 'generic/platform=iOS' build`: Build with the new Xcode before uploading to App Store Connect.

## Detected by

No built-in detector reads `swift` declarations yet; the rule is data in the [lifecycle registry](https://github.com/arminazimi/evergreen/blob/main/registry/swift.json).

## Data

This page is generated from [`registry/swift.json`](https://github.com/arminazimi/evergreen/blob/main/registry/swift.json), rule `swift.xcode.app-store-15`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/swift.xcode.app-store-15.html",
  "url": "https://arminazimi.github.io/evergreen/rules/swift.xcode.app-store-15.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/swift.xcode.app-store-15.html",
  "headline": "Xcode 15 is not accepted for App Store uploads — dates, impact, migration",
  "description": "Since April 24, 2025, apps uploaded to App Store Connect must be built with Xcode 16 or later using an SDK for iOS 18, iPadOS 18, tvOS 18, visionOS 2, or watchOS 11.",
  "inLanguage": "en",
  "dateModified": "2026-10-19",
  "keywords": [
    "end-of-support",
    "swift",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Xcode 15 is not accepted for App Store uploads",
    "identifier": "pkg:generic/xcode"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "SDK minimum requirements — App Store upcoming requirements (Xcode 16)",
      "url": "https://developer.apple.com/news/upcoming-requirements/?id=02212025a"
    }
  ],
  "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/swift.json",
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen"
  }
}
</script>
