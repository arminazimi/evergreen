---
title: "@hapi/joi is deprecated"
description: "npm marks @hapi/joi as deprecated and directs users to the joi package."
---

# @hapi/joi is deprecated

npm marks @hapi/joi as deprecated and directs users to the joi package.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/%40hapi/joi` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | joi |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.hapi.joi.deprecated` |

## Sources

- [@hapi/joi package deprecation notice](https://www.npmjs.com/package/@hapi/joi)
- [@hapi/joi registry metadata](https://registry.npmjs.org/@hapi%2fjoi/latest)

## Migration

**Constraints**

- Preserve validation schemas, preferences, extensions, and error handling.

**Steps**

1. **Replace @hapi/joi.** Move the dependency and imports from @hapi/joi to joi, then adapt any API differences for the installed target version.
2. **Verify validation behavior.** Exercise successful and failing validation paths and compare their values and errors.

**Verification**

- `npm run test --if-present`: Run schema validation and repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.hapi.joi.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
