---
title: "gulp-util is deprecated"
description: "npm marks gulp-util as deprecated and links to the Gulp migration guidance."
---

# gulp-util is deprecated

npm marks gulp-util as deprecated and links to the Gulp migration guidance.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/gulp-util` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | Maintained purpose-specific modules listed by Gulp |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.gulp-util.deprecated` |

## Sources

- [gulp-util package deprecation notice](https://www.npmjs.com/package/gulp-util)
- [gulp-util registry metadata](https://registry.npmjs.org/gulp-util/latest)

## Migration

**Constraints**

- Preserve each used utility's logging, file, plugin-error, and stream behavior.

**Steps**

1. **Inventory gulp-util APIs.** Map every imported gulp-util member to the purpose-specific replacement recommended by Gulp.
2. **Install focused replacements.** Replace gulp-util imports and dependency with only the maintained modules required by those usages.

**Verification**

- `npm run build --if-present`: Run the Gulp build and verify task output.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.gulp-util.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
