---
title: "Xcode 15 through 25 are not accepted for App Store uploads — dates, impact, migration"
description: "Since April 28, 2026. Apps uploaded to App Store Connect must be built with Xcode 26 or later using an SDK for iOS 26, iPadOS 26, tvOS 26, visionOS 26, or watchOS 26."
canonical_url: "https://arminazimi.github.io/evergreen/rules/swift.xcode.app-store-15-through-25.html"
image: "/assets/og/swift.xcode.app-store-15-through-25.svg"
json_twin: "/rules/swift.xcode.app-store-15-through-25.json"
---

# Xcode 15 through 25 are not accepted for App Store uploads

**End of support** as of 2026-04-28. Replacement: Xcode 26 or later. Source: [SDK minimum requirements — App Store upcoming requirements (Xcode 26)](https://developer.apple.com/news/upcoming-requirements/?id=04282026a).

Check a version:

```bash
evergreen check pkg:generic/xcode
```

Since April 28, 2026. Apps uploaded to App Store Connect must be built with Xcode 26 or later using an SDK for iOS 26, iPadOS 26, tvOS 26, visionOS 26, or watchOS 26.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `swift` |
| Component | `pkg:generic/xcode` |
| Affected versions | `vers:semver/>=15.0.0\|<26.0.0` |
| Date from the source | 2026-04-28 |
| Replacement | Xcode 26 or later |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi |
| Review due | 2027-01-17 (90 days after the last review) |
| Rule ID | `swift.xcode.app-store-15-through-25` |

## Sources

- [SDK minimum requirements — App Store upcoming requirements (Xcode 26)](https://developer.apple.com/news/upcoming-requirements/?id=04282026a)

## Migration

**Constraints**

- Keep .xcode-version, CI Xcode selections, and local installs on one Xcode release that App Store Connect still accepts.

**Steps**

1. **Raise the Xcode pin.** Change the reported .xcode-version (or equivalent CI Xcode version) from the 15–25 line to Xcode 26 or later.
2. **Align other Xcode surfaces.** Update CI macOS/Xcode images and documented install steps so they match the new pin.

**Verification**

- `xcodebuild -version`: Confirm the active Xcode is the intended release.
- `xcodebuild -scheme "$(basename "$PWD")" -destination 'generic/platform=iOS' build`: Build with the new Xcode before uploading to App Store Connect.
- `swift build && swift test`: Build and test the Swift package on the toolchain that matches the new Xcode.

## Detected by

The `swift` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/swift.json`](https://github.com/arminazimi/evergreen/blob/main/registry/swift.json), rule `swift.xcode.app-store-15-through-25`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/swift.xcode.app-store-15-through-25.html",
      "url": "https://arminazimi.github.io/evergreen/rules/swift.xcode.app-store-15-through-25.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/swift.xcode.app-store-15-through-25.html",
      "headline": "Xcode 15 through 25 are not accepted for App Store uploads — dates, impact, migration",
      "description": "Since April 28, 2026. Apps uploaded to App Store Connect must be built with Xcode 26 or later using an SDK for iOS 26, iPadOS 26, tvOS 26, visionOS 26, or watchOS 26.",
      "inLanguage": "en",
      "dateModified": "2026-10-19",
      "keywords": [
        "end-of-support",
        "swift",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "Xcode 15 through 25 are not accepted for App Store uploads",
        "identifier": "pkg:generic/xcode"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "SDK minimum requirements — App Store upcoming requirements (Xcode 26)",
          "url": "https://developer.apple.com/news/upcoming-requirements/?id=04282026a"
        }
      ],
      "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/swift.json",
      "publisher": {
        "@type": "Organization",
        "name": "Evergreen",
        "url": "https://arminazimi.github.io/evergreen"
      }
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/swift.xcode.app-store-15-through-25.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/swift.xcode.app-store-15-through-25.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/xcode?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of support as of 2026-04-28. Affected versions: vers:semver/>=15.0.0|\u003c26.0.0. Source: SDK minimum requirements — App Store upcoming requirements (Xcode 26) (https://developer.apple.com/news/upcoming-requirements/?id=04282026a)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/xcode?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Xcode 26 or later"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/xcode?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/xcode."
          }
        }
      ]
    }
  ]
}
</script>
