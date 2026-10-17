---
title: "request is deprecated"
description: "The package is fully deprecated and no new changes are expected."
---

# request is deprecated

The package is fully deprecated and no new changes are expected.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | high |
| Ecosystem | `npm` |
| Component | `pkg:npm/request` |
| Affected versions | `vers:npm/*` |
| Date from the source | 2020-02-11 |
| Replacement | Native fetch or a maintained HTTP client |
| Evidence last seen | 2026-10-13 |
| Reviewed | 2026-10-14 by arminazimi |
| Review due | 2027-10-14 (365 days after the last review) |
| Rule ID | `npm.package.request.deprecated` |

## Sources

- [request package deprecation notice](https://www.npmjs.com/package/request)

## Migration

**Constraints**

- Preserve request method, headers, authentication, redirects, timeouts, retries, proxy behavior, streaming, and response/error semantics used by each call site.

**Steps**

1. **Choose the target HTTP client.** Select native fetch or one maintained client whose behavior covers the affected request usages.
2. **Rewrite request usages.** Translate callbacks, options, response handling, errors, and streams at every reported import and call.
3. **Replace the dependency.** Remove request from package metadata and add the selected maintained client only if native fetch is insufficient.

**Verification**

- `npm run test --if-present`: Run HTTP behavior and repository tests when defined.
- `npm run build --if-present`: Verify imports, types, and the build remain valid.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.request.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
