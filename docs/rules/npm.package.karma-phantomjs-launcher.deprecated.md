---
title: "karma-phantomjs-launcher is deprecated"
description: "npm states that PhantomJS development stopped and recommends Puppeteer or a similar maintained browser."
---

# karma-phantomjs-launcher is deprecated

npm states that PhantomJS development stopped and recommends Puppeteer or a similar maintained browser.

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

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.karma-phantomjs-launcher.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
