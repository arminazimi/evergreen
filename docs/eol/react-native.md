---
title: "Is React Native end of life? — versions, dates, sources"
description: "React Native has releases that are out of support. React Native 0.77 through 0.84 are unsupported. The source gives no day."
canonical_url: "https://arminazimi.github.io/evergreen/eol/react-native.html"
---

# Is React Native end of life?

**React Native has releases that are out of support.** React Native 0.77 through 0.84 are unsupported. The source gives no day. This page lists 1 reviewed lifecycle rule for `pkg:npm/react-native`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:npm/react-native
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [React Native 0.77 through 0.84 are unsupported](../rules/npm.package.react-native.0.77-to-0.84.end-of-support.html) | End of support | The source gives no day | `vers:npm/>=0.77.0-0\|<0.85.0-0` | [React Native Releases Working Group support policy](https://github.com/reactwg/react-native-releases/blob/main/docs/support.md), [React Native releases overview](https://reactnative.dev/releases/overview), [React Native upgrading guide](https://reactnative.dev/docs/upgrading), [React Native Upgrade Helper](https://react-native-community.github.io/upgrade-helper/) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/react-native.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/react-native.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is React Native end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "React Native has releases that are out of support. React Native 0.77 through 0.84 are unsupported. The source gives no day. This page lists 1 reviewed lifecycle rule for pkg:npm/react-native, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check React Native?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:npm/react-native."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the React Native dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
