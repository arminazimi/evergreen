---
title: "inflight is deprecated"
description: "npm states that inflight is unsupported, leaks memory, and recommends lru-cache for keyed request coalescing."
---

# inflight is deprecated

npm states that inflight is unsupported, leaks memory, and recommends lru-cache for keyed request coalescing.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/inflight` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | lru-cache |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.inflight.deprecated` |

## Sources

- [inflight package deprecation notice](https://www.npmjs.com/package/inflight)
- [inflight registry metadata](https://registry.npmjs.org/inflight/latest)

## Migration

**Constraints**

- Preserve request coalescing, callback delivery, cache-key identity, and cleanup on success and failure.

**Steps**

1. **Replace inflight.** Implement keyed coalescing with lru-cache or another maintained primitive and remove inflight.
2. **Verify concurrent behavior.** Test duplicate concurrent requests, failures, retries, and cleanup after completion.

**Verification**

- `npm run test --if-present`: Run concurrency, memory-lifecycle, and repository tests.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.inflight.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
