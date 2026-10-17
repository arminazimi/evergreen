---
title: "resolve-url is deprecated"
description: "The maintainer deprecated resolve-url and recommends the platform URL API for resolving URLs in browsers."
---

# resolve-url is deprecated

The maintainer deprecated resolve-url and recommends the platform URL API for resolving URLs in browsers.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/resolve-url` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | URL |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.resolve-url.deprecated` |

## Sources

- [resolve-url maintainer deprecation notice](https://github.com/lydell/resolve-url#deprecated)
- [resolve-url registry metadata](https://registry.npmjs.org/resolve-url/latest)

## Migration

**Constraints**

- Preserve base URL selection, sequential resolution, protocol-relative URLs, absolute URLs, encoding, and browser compatibility.

**Steps**

1. **Use the URL API.** Replace resolve-url calls with URL construction, applying each base explicitly and returning the same string form expected by callers.

**Verification**

- `npm run test --if-present`: Run relative, absolute, protocol-relative, encoded, multi-base, and repository tests.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.resolve-url.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
