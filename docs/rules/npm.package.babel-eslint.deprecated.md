---
title: "babel-eslint is deprecated"
description: "npm marks babel-eslint as deprecated: \"babel-eslint is now @babel/eslint-parser. This package will no longer receive updates.\""
---

# babel-eslint is deprecated

npm marks babel-eslint as deprecated: "babel-eslint is now @babel/eslint-parser. This package will no longer receive updates."

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/babel-eslint` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | @babel/eslint-parser |
| Evidence last seen | 2026-10-17 |
| Reviewed | 2026-10-17 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-17 (365 days after the last review) |
| Rule ID | `npm.package.babel-eslint.deprecated` |

## Sources

- [babel-eslint on npm](https://www.npmjs.com/package/babel-eslint)
- [babel-eslint registry metadata](https://registry.npmjs.org/babel-eslint/latest)

## Migration

**Constraints**

- Keep the same parser options, lint rules, and supported syntax (decorators, class properties, Flow) in the new parser configuration.

**Steps**

1. **Replace the parser package.** Replace babel-eslint with @babel/eslint-parser in dependencies and set the ESLint parser to @babel/eslint-parser.
2. **Provide a Babel configuration.** @babel/eslint-parser needs a Babel config (or requireConfigFile: false with parserOptions.babelOptions); add one so the same syntax parses.

**Verification**

- `npm run lint --if-present`: Run the linter with the new parser and compare the results.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.babel-eslint.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
