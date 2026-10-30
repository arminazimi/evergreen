---
title: "iOS and iPadOS app targets below iOS 13 are not accepted for App Store uploads — dates, impact, migration"
description: "Since September 9, 2026, iOS and iPadOS apps uploaded to App Store Connect must target iOS 13 or later."
canonical_url: "https://arminazimi.github.io/evergreen/rules/swift.app-store.ios-below-13.html"
json_twin: "/rules/swift.app-store.ios-below-13.json"
---

# iOS and iPadOS app targets below iOS 13 are not accepted for App Store uploads

**End of support** as of 2026-09-09. Replacement: iOS 13 or later. Source: [iOS and iPadOS minimum system requirements — App Store upcoming requirements](https://developer.apple.com/news/upcoming-requirements/?id=0992026a).

Check a version:

```bash
evergreen check pkg:generic/ios
```

Since September 9, 2026, iOS and iPadOS apps uploaded to App Store Connect must target iOS 13 or later.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `swift` |
| Component | `pkg:generic/ios` |
| Affected versions | `vers:semver/<13.0.0` |
| Date from the source | 2026-09-09 |
| Replacement | iOS 13 or later |
| Evidence last seen | 2026-10-20 |
| Reviewed | 2026-10-20 by arminazimi |
| Review due | 2027-01-18 (90 days after the last review) |
| Rule ID | `swift.app-store.ios-below-13` |

## Sources

- [iOS and iPadOS minimum system requirements — App Store upcoming requirements](https://developer.apple.com/news/upcoming-requirements/?id=0992026a)

## Migration

**Constraints**

- Set the deployment target on the app target that is uploaded, not on a library or Swift package: libraries that declare an older platforms minimum are not changed by this rule.
- Raising the minimum removes iOS releases from the app's audience, and can remove APIs the app relies on; keep the minimum your users still run at or above 13.

**Steps**

1. **Raise the iOS deployment target.** Set IPHONEOS_DEPLOYMENT_TARGET on each build configuration of the app target to 13.0 or later (see the replacement), and keep it consistent across Debug and Release.
2. **Align other deployment surfaces.** Update the minimum version in documentation, release notes, and any App Store Connect or TestFlight metadata that names the old minimum.

**Verification**

- `xcodebuild -showBuildSettings -scheme "$(basename "$PWD")" | grep IPHONEOS_DEPLOYMENT_TARGET`: Confirm the app target resolves to the raised deployment target.
- `xcodebuild -scheme "$(basename "$PWD")" -destination 'generic/platform=iOS' build`: Build the app for iOS with the raised deployment target before uploading.

## Detected by

The `swift` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/swift.json`](https://github.com/arminazimi/evergreen/blob/main/registry/swift.json), rule `swift.app-store.ios-below-13`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/swift.app-store.ios-below-13.html",
      "url": "https://arminazimi.github.io/evergreen/rules/swift.app-store.ios-below-13.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/swift.app-store.ios-below-13.html",
      "headline": "iOS and iPadOS app targets below iOS 13 are not accepted for App Store uploads — dates, impact, migration",
      "description": "Since September 9, 2026, iOS and iPadOS apps uploaded to App Store Connect must target iOS 13 or later.",
      "inLanguage": "en",
      "dateModified": "2026-10-20",
      "keywords": [
        "end-of-support",
        "swift",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "iOS and iPadOS app targets below iOS 13 are not accepted for App Store uploads",
        "identifier": "pkg:generic/ios"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "iOS and iPadOS minimum system requirements — App Store upcoming requirements",
          "url": "https://developer.apple.com/news/upcoming-requirements/?id=0992026a"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/swift.app-store.ios-below-13.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/swift.app-store.ios-below-13.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/ios?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of support as of 2026-09-09. Affected versions: vers:semver/\u003c13.0.0. Source: iOS and iPadOS minimum system requirements — App Store upcoming requirements (https://developer.apple.com/news/upcoming-requirements/?id=0992026a)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/ios?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "iOS 13 or later"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/ios?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/ios."
          }
        }
      ]
    }
  ]
}
</script>
