---
title: "React Native 0.77 through 0.84 are unsupported — dates, impact, migration"
description: "The React Native release schedule lists the 0.77.x through 0.84.x minor series as Unsupported."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.react-native.0.77-to-0.84.end-of-support.html"
---

# React Native 0.77 through 0.84 are unsupported

The React Native release schedule lists the 0.77.x through 0.84.x minor series as Unsupported. No new releases are expected, except possible fixes for very important regressions, and the Release Crew recommends upgrading as soon as possible.

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `npm` |
| Component | `pkg:npm/react-native` |
| Affected versions | `vers:npm/>=0.77.0-0\|<0.85.0-0` |
| Date from the source | The source gives no day |
| Replacement | React Native 0.87 (Active) |
| Evidence last seen | 2026-10-23 |
| Reviewed | 2026-10-23 by arminazimi |
| Review due | 2027-10-23 (365 days after the last review) |
| Rule ID | `npm.package.react-native.0.77-to-0.84.end-of-support` |

## Sources

- [React Native Releases Working Group support policy](https://github.com/reactwg/react-native-releases/blob/main/docs/support.md)
- [React Native releases overview](https://reactnative.dev/releases/overview)
- [React Native upgrading guide](https://reactnative.dev/docs/upgrading)
- [React Native Upgrade Helper](https://react-native-community.github.io/upgrade-helper/)

## Migration

**Constraints**

- Preserve the application's JavaScript behavior and its Android and iOS native customizations while applying the official template changes.
- Upgrade incrementally and review the Upgrade Helper diff and release notes for every intervening React Native minor series.
- For Expo projects, upgrade Expo SDK versions one at a time and use the React Native version supported by each SDK.

**Steps**

1. **Choose the React Native or Expo upgrade path.** For a React Native Community CLI application, plan an incremental path to an Active release. For an Expo application, follow Expo's SDK upgrade walkthrough one SDK at a time instead of setting react-native independently.
2. **Update React Native and its peer dependencies.** For each step, use the package.json diff in Upgrade Helper to update react-native, react, and the related @react-native packages to the versions required by that release.
3. **Apply the native project template changes.** Use Upgrade Helper for each intervening minor series and manually apply its Android, iOS, Metro, Babel, CocoaPods, and Gradle template changes while preserving project-specific native code.
4. **Review changed React Native APIs.** Check each reported react-native import against the intervening release notes and replace APIs that were removed, renamed, or changed before moving to the next release.

**Verification**

- `npm ls react-native react`: Confirm that React Native and React resolve to the versions required by the target release.
- `npm run lint --if-present`: Check JavaScript and TypeScript code after applying API changes.
- `npm test --if-present`: Run the repository tests after each incremental upgrade.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.react-native.0.77-to-0.84.end-of-support`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.react-native.0.77-to-0.84.end-of-support.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.react-native.0.77-to-0.84.end-of-support.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.react-native.0.77-to-0.84.end-of-support.html",
  "headline": "React Native 0.77 through 0.84 are unsupported — dates, impact, migration",
  "description": "The React Native release schedule lists the 0.77.x through 0.84.x minor series as Unsupported.",
  "inLanguage": "en",
  "dateModified": "2026-10-23",
  "keywords": [
    "end-of-support",
    "npm",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "React Native 0.77 through 0.84 are unsupported",
    "identifier": "pkg:npm/react-native"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "React Native Releases Working Group support policy",
      "url": "https://github.com/reactwg/react-native-releases/blob/main/docs/support.md"
    },
    {
      "@type": "CreativeWork",
      "name": "React Native releases overview",
      "url": "https://reactnative.dev/releases/overview"
    },
    {
      "@type": "CreativeWork",
      "name": "React Native upgrading guide",
      "url": "https://reactnative.dev/docs/upgrading"
    },
    {
      "@type": "CreativeWork",
      "name": "React Native Upgrade Helper",
      "url": "https://react-native-community.github.io/upgrade-helper/"
    }
  ],
  "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/npm.json",
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen"
  }
}
</script>
