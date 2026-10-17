---
title: "uglify-es is deprecated"
description: "npm marks uglify-es as deprecated: \"support for ECMAScript is superseded by `uglify-js` as of v3.13.0\""
---

# uglify-es is deprecated

npm marks uglify-es as deprecated: "support for ECMAScript is superseded by `uglify-js` as of v3.13.0"

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/uglify-es` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | uglify-js (3.13 or later) or terser |
| Evidence last seen | 2026-10-17 |
| Reviewed | 2026-10-17 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-17 (365 days after the last review) |
| Rule ID | `npm.package.uglify-es.deprecated` |

## Sources

- [uglify-es on npm](https://www.npmjs.com/package/uglify-es)
- [uglify-es registry metadata](https://registry.npmjs.org/uglify-es/latest)

## Migration

**Constraints**

- Keep the same minification options, source maps, and output syntax level.

**Steps**

1. **Replace uglify-es.** Replace uglify-es with uglify-js 3.13 or later (or terser) in dependencies, build scripts, and bundler configuration.
2. **Compare minified output.** Build and compare bundle size, source maps, and behavior of the minified output.

**Verification**

- `npm run build --if-present`: Build with the new minifier and compare the output.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.uglify-es.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
