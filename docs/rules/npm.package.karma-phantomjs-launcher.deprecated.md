---
title: "karma-phantomjs-launcher is deprecated — dates, impact, migration"
description: "npm states that PhantomJS development stopped and recommends Puppeteer or a similar maintained browser."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.karma-phantomjs-launcher.deprecated.html"
json_twin: "/rules/npm.package.karma-phantomjs-launcher.deprecated.json"
---

# karma-phantomjs-launcher is deprecated

**Deprecated.** The source gives no day. Replacement: A maintained Karma browser launcher such as karma-chrome-launcher. Source: [karma-phantomjs-launcher package deprecation notice](https://www.npmjs.com/package/karma-phantomjs-launcher).

Check a version:

```bash
evergreen check pkg:npm/karma-phantomjs-launcher
```

npm states that PhantomJS development stopped and recommends Puppeteer or a similar maintained browser.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/karma-phantomjs-launcher` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | A maintained Karma browser launcher such as karma-chrome-launcher |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.karma-phantomjs-launcher.deprecated` |

## Sources

- [karma-phantomjs-launcher package deprecation notice](https://www.npmjs.com/package/karma-phantomjs-launcher)
- [karma-phantomjs-launcher registry metadata](https://registry.npmjs.org/karma-phantomjs-launcher/latest)

## Migration

**Constraints**

- Preserve browser test coverage, Karma execution mode, launch flags, and CI behavior.

**Steps**

1. **Select a maintained browser launcher.** Choose a maintained Karma launcher supported by local and CI environments and add its package.
2. **Replace PhantomJS configuration.** Replace the PhantomJS launcher and browser name in Karma configuration, then remove karma-phantomjs-launcher.

**Verification**

- `npm run test --if-present`: Run the browser test suite in its supported local or CI mode.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.karma-phantomjs-launcher.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.karma-phantomjs-launcher.deprecated.html",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.karma-phantomjs-launcher.deprecated.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.karma-phantomjs-launcher.deprecated.html",
      "headline": "karma-phantomjs-launcher is deprecated — dates, impact, migration",
      "description": "npm states that PhantomJS development stopped and recommends Puppeteer or a similar maintained browser.",
      "inLanguage": "en",
      "dateModified": "2026-10-16",
      "keywords": [
        "deprecated",
        "npm",
        "medium"
      ],
      "about": {
        "@type": "Thing",
        "name": "karma-phantomjs-launcher is deprecated",
        "identifier": "pkg:npm/karma-phantomjs-launcher"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "karma-phantomjs-launcher package deprecation notice",
          "url": "https://www.npmjs.com/package/karma-phantomjs-launcher"
        },
        {
          "@type": "CreativeWork",
          "name": "karma-phantomjs-launcher registry metadata",
          "url": "https://registry.npmjs.org/karma-phantomjs-launcher/latest"
        }
      ],
      "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/npm.json",
      "publisher": {
        "@type": "Organization",
        "name": "Evergreen",
        "url": "https://arminazimi.github.io/evergreen"
      }
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.karma-phantomjs-launcher.deprecated.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.karma-phantomjs-launcher.deprecated.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:npm/karma-phantomjs-launcher?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated. The source gives no day. Affected versions: vers:npm/*. Source: karma-phantomjs-launcher package deprecation notice (https://www.npmjs.com/package/karma-phantomjs-launcher)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:npm/karma-phantomjs-launcher?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A maintained Karma browser launcher such as karma-chrome-launcher"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:npm/karma-phantomjs-launcher?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:npm/karma-phantomjs-launcher."
          }
        }
      ]
    }
  ]
}
</script>
