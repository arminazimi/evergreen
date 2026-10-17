---
title: "popper.js is deprecated"
description: "npm identifies popper.js as the legacy Popper v1 package and directs users to @popperjs/core for Popper v2."
---

# popper.js is deprecated

npm identifies popper.js as the legacy Popper v1 package and directs users to @popperjs/core for Popper v2.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/popper.js` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | @popperjs/core |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.popper.js.deprecated` |

## Sources

- [popper.js package deprecation notice](https://www.npmjs.com/package/popper.js)
- [popper.js registry metadata](https://registry.npmjs.org/popper.js/latest)

## Migration

**Constraints**

- Preserve placement, modifiers, boundary and overflow behavior, event listeners, and browser support.

**Steps**

1. **Replace Popper v1.** Replace popper.js with @popperjs/core and migrate constructors, options, and modifiers to the Popper v2 API.
2. **Verify positioned elements.** Exercise every placement, scrolling container, viewport edge, and dynamic update path used by the interface.

**Verification**

- `npm run test --if-present`: Run positioning and repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.popper.js.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
