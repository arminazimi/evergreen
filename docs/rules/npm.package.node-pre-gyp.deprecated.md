---
title: "node-pre-gyp is deprecated"
description: "npm states that the unscoped node-pre-gyp package is deprecated and only @mapbox/node-pre-gyp will receive updates."
---

# node-pre-gyp is deprecated

npm states that the unscoped node-pre-gyp package is deprecated and only @mapbox/node-pre-gyp will receive updates.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | high |
| Ecosystem | `npm` |
| Component | `pkg:npm/node-pre-gyp` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | @mapbox/node-pre-gyp |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.node-pre-gyp.deprecated` |

## Sources

- [node-pre-gyp package deprecation notice](https://www.npmjs.com/package/node-pre-gyp)
- [node-pre-gyp registry metadata](https://registry.npmjs.org/node-pre-gyp/latest)

## Migration

**Constraints**

- Preserve native-binary download locations, ABI selection, source-build fallback, install scripts, and publishing behavior.

**Steps**

1. **Replace node-pre-gyp.** Move the dependency, scripts, imports, and binary configuration from node-pre-gyp to @mapbox/node-pre-gyp.
2. **Verify native package installation.** Test prebuilt-binary download and source-build fallback on every supported platform and Node.js ABI.

**Verification**

- `npm run build --if-present`: Build or install the native package with the scoped replacement.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.node-pre-gyp.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
