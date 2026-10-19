---
title: "Xcode older than 14.1 is not accepted for App Store uploads — dates, impact, migration"
description: "Since April 25, 2023. iOS and iPadOS apps submitted to the App Store must be built with Xcode 14.1 and the iOS 16.1 SDK or later."
canonical_url: "https://arminazimi.github.io/evergreen/rules/swift.xcode.app-store-below-14-1.html"
---

# Xcode older than 14.1 is not accepted for App Store uploads

Since April 25, 2023. iOS and iPadOS apps submitted to the App Store must be built with Xcode 14.1 and the iOS 16.1 SDK or later. And watchOS apps submitted to the App Store must be built with Xcode 14.1 and the watchOS 9.1 SDK or later.

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `swift` |
| Component | `pkg:generic/xcode` |
| Affected versions | `vers:semver/<14.1.0` |
| Date from the source | 2023-04-25 |
| Replacement | Xcode 14.1 or later |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi |
| Review due | 2027-01-17 (90 days after the last review) |
| Rule ID | `swift.xcode.app-store-below-14-1` |

## Sources

- [Xcode 14.1 — App Store upcoming requirements (Xcode 14.1)](https://developer.apple.com/news/upcoming-requirements/?id=04252023a)

## Migration

**Constraints**

- Keep .xcode-version, CI Xcode selections, and local installs on one Xcode release that App Store Connect still accepts.
- Later App Store SDK minimums also require newer Xcode lines; plan to land on the current minimum (see the replacement).

**Steps**

1. **Raise the Xcode pin.** Change the reported .xcode-version (or equivalent CI Xcode version) from the rejected line to a release App Store Connect accepts (see the replacement).
2. **Align other Xcode surfaces.** Update CI macOS/Xcode images and documented install steps so they match the new pin.

**Verification**

- `xcodebuild -version`: Confirm the active Xcode is the intended release.
- `xcodebuild -scheme "$(basename "$PWD")" -destination 'generic/platform=iOS' build`: Build with the new Xcode before uploading to App Store Connect.

## Detected by

No built-in detector reads `swift` declarations yet; the rule is data in the [lifecycle registry](https://github.com/arminazimi/evergreen/blob/main/registry/swift.json).

## Data

This page is generated from [`registry/swift.json`](https://github.com/arminazimi/evergreen/blob/main/registry/swift.json), rule `swift.xcode.app-store-below-14-1`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/swift.xcode.app-store-below-14-1.html",
  "url": "https://arminazimi.github.io/evergreen/rules/swift.xcode.app-store-below-14-1.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/swift.xcode.app-store-below-14-1.html",
  "headline": "Xcode older than 14.1 is not accepted for App Store uploads — dates, impact, migration",
  "description": "Since April 25, 2023. iOS and iPadOS apps submitted to the App Store must be built with Xcode 14.1 and the iOS 16.1 SDK or later.",
  "inLanguage": "en",
  "dateModified": "2026-10-19",
  "keywords": [
    "end-of-support",
    "swift",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Xcode older than 14.1 is not accepted for App Store uploads",
    "identifier": "pkg:generic/xcode"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Xcode 14.1 — App Store upcoming requirements (Xcode 14.1)",
      "url": "https://developer.apple.com/news/upcoming-requirements/?id=04252023a"
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
