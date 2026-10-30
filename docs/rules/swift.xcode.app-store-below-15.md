---
title: "Xcode older than 15 is not accepted for App Store uploads — dates, impact, migration"
description: "Apps uploaded to App Store Connect must be built with Xcode 15 for iOS 17, iPadOS 17, tvOS 17, or watchOS 10 starting April 29, 2024."
canonical_url: "https://arminazimi.github.io/evergreen/rules/swift.xcode.app-store-below-15.html"
json_twin: "/rules/swift.xcode.app-store-below-15.json"
---

# Xcode older than 15 is not accepted for App Store uploads

Apps uploaded to App Store Connect must be built with Xcode 15 for iOS 17, iPadOS 17, tvOS 17, or watchOS 10 starting April 29, 2024.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `swift` |
| Component | `pkg:generic/xcode` |
| Affected versions | `vers:semver/<15.0.0` |
| Date from the source | 2024-04-29 |
| Replacement | Xcode 26 or later |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi |
| Review due | 2027-01-17 (90 days after the last review) |
| Rule ID | `swift.xcode.app-store-below-15` |

## Sources

- [Xcode 15 — App Store upcoming requirements](https://developer.apple.com/news/upcoming-requirements/?id=04292024a)

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
- `swift build && swift test`: Build and test the Swift package on the toolchain that matches the new Xcode.

## Detected by

The `swift` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/swift.json`](https://github.com/arminazimi/evergreen/blob/main/registry/swift.json), rule `swift.xcode.app-store-below-15`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/swift.xcode.app-store-below-15.html",
  "url": "https://arminazimi.github.io/evergreen/rules/swift.xcode.app-store-below-15.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/swift.xcode.app-store-below-15.html",
  "headline": "Xcode older than 15 is not accepted for App Store uploads — dates, impact, migration",
  "description": "Apps uploaded to App Store Connect must be built with Xcode 15 for iOS 17, iPadOS 17, tvOS 17, or watchOS 10 starting April 29, 2024.",
  "inLanguage": "en",
  "dateModified": "2026-10-19",
  "keywords": [
    "end-of-support",
    "swift",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Xcode older than 15 is not accepted for App Store uploads",
    "identifier": "pkg:generic/xcode"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Xcode 15 — App Store upcoming requirements",
      "url": "https://developer.apple.com/news/upcoming-requirements/?id=04292024a"
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
