---
title: "request-promise-native is deprecated"
description: "npm states that request-promise-native is deprecated because it extends the deprecated request package."
---

# request-promise-native is deprecated

npm states that request-promise-native is deprecated because it extends the deprecated request package.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | high |
| Ecosystem | `npm` |
| Component | `pkg:npm/request-promise-native` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | Native fetch or a maintained promise-based HTTP client |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.request-promise-native.deprecated` |

## Sources

- [request-promise-native package deprecation notice](https://www.npmjs.com/package/request-promise-native)
- [request-promise-native registry metadata](https://registry.npmjs.org/request-promise-native/latest)

## Migration

**Constraints**

- Preserve request options, authentication, redirects, timeouts, transforms, full-response mode, and native-Promise rejection behavior.

**Steps**

1. **Select the target HTTP client.** Choose native fetch or one maintained promise-based client that covers the affected request-promise-native behavior.
2. **Replace request-promise-native.** Rewrite requests, response handling, and errors for the selected client, then remove request-promise-native.

**Verification**

- `npm run test --if-present`: Run HTTP behavior and repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.request-promise-native.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
