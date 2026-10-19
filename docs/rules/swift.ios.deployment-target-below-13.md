---
title: "iOS deployment targets older than 13 are not accepted for App Store uploads — dates, impact, migration"
description: "Since September 9, 2026, iOS and iPadOS apps uploaded to App Store Connect must target iOS 13 or later. A minimum deployment target below iOS 13 no longer meets that requirement."
canonical_url: "https://arminazimi.github.io/evergreen/rules/swift.ios.deployment-target-below-13.html"
---

# iOS deployment targets older than 13 are not accepted for App Store uploads

Since September 9, 2026, iOS and iPadOS apps uploaded to App Store Connect must target iOS 13 or later. A minimum deployment target below iOS 13 no longer meets that requirement.

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `swift` |
| Component | `pkg:generic/ios` |
| Affected versions | `vers:semver/<13.0.0` |
| Date from the source | 2026-09-09 |
| Replacement | iOS 13 or later |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi |
| Review due | 2027-01-17 (90 days after the last review) |
| Rule ID | `swift.ios.deployment-target-below-13` |

## Sources

- [iOS and iPadOS minimum system requirements — App Store upcoming requirements](https://developer.apple.com/news/upcoming-requirements/?id=0992026a)

## Migration

**Constraints**

- Raise the iOS deployment target in the Xcode project, Package.swift platforms, or shared xcconfig so every target agrees.

**Steps**

1. **Raise the iOS deployment target.** Change the reported iOS (or iPadOS) minimum from below 13 to iOS 13 or later, matching the App Store Connect requirement.

**Verification**

- `xcodebuild -showBuildSettings | grep IPHONEOS_DEPLOYMENT_TARGET`: Confirm the deployment target is iOS 13 or later.

## Detected by

No built-in detector reads `swift` declarations yet; the rule is data in the [lifecycle registry](https://github.com/arminazimi/evergreen/blob/main/registry/swift.json).

## Data

This page is generated from [`registry/swift.json`](https://github.com/arminazimi/evergreen/blob/main/registry/swift.json), rule `swift.ios.deployment-target-below-13`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/swift.ios.deployment-target-below-13.html",
  "url": "https://arminazimi.github.io/evergreen/rules/swift.ios.deployment-target-below-13.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/swift.ios.deployment-target-below-13.html",
  "headline": "iOS deployment targets older than 13 are not accepted for App Store uploads — dates, impact, migration",
  "description": "Since September 9, 2026, iOS and iPadOS apps uploaded to App Store Connect must target iOS 13 or later. A minimum deployment target below iOS 13 no longer meets that requirement.",
  "inLanguage": "en",
  "dateModified": "2026-10-19",
  "keywords": [
    "end-of-support",
    "swift",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "iOS deployment targets older than 13 are not accepted for App Store uploads",
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
}
</script>
