---
title: "babel-preset-es2015 is deprecated"
description: "npm recommends babel-preset-env instead of babel-preset-es2015."
---

# babel-preset-es2015 is deprecated

npm recommends babel-preset-env instead of babel-preset-es2015.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/babel-preset-es2015` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | @babel/preset-env |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.babel-preset-es2015.deprecated` |

## Sources

- [babel-preset-es2015 package deprecation notice](https://www.npmjs.com/package/babel-preset-es2015)
- [babel-preset-es2015 registry metadata](https://registry.npmjs.org/babel-preset-es2015/latest)

## Migration

**Constraints**

- Preserve the JavaScript syntax targets and emitted runtime behavior required by supported environments.

**Steps**

1. **Replace the Babel preset.** Replace babel-preset-es2015 with @babel/preset-env and update Babel configuration to use @babel/preset-env.
2. **Configure supported targets.** Set explicit target environments so the replacement emits only the transforms and polyfill behavior the project requires.

**Verification**

- `npm run build --if-present`: Build the project and verify the replacement Babel output.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.babel-preset-es2015.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
