---
title: "left-pad is deprecated — dates, impact, migration"
description: "The package author recommends the built-in String.prototype.padStart method."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.left-pad.deprecated.html"
---

# left-pad is deprecated

The package author recommends the built-in String.prototype.padStart method.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/left-pad` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | String.prototype.padStart() |
| Evidence last seen | 2026-10-13 |
| Reviewed | 2026-10-14 by arminazimi |
| Review due | 2027-10-14 (365 days after the last review) |
| Rule ID | `npm.package.left-pad.deprecated` |

## Sources

- [left-pad package deprecation notice](https://www.npmjs.com/package/left-pad)

## Migration

**Constraints**

- Preserve target width, fill-string behavior, string coercion, and handling of values already wider than the requested length.

**Steps**

1. **Replace left-pad calls.** Convert each reported call to String(value).padStart(length, fill) while preserving existing coercion and defaults.
2. **Remove the dependency.** Delete left-pad from package metadata and refresh the lockfile.

**Verification**

- `npm run test --if-present`: Run padding edge cases and repository tests when defined.
- `npm run build --if-present`: Verify the project builds without left-pad.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.left-pad.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.left-pad.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.left-pad.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.left-pad.deprecated.html",
  "headline": "left-pad is deprecated — dates, impact, migration",
  "description": "The package author recommends the built-in String.prototype.padStart method.",
  "inLanguage": "en",
  "dateModified": "2026-10-14",
  "keywords": [
    "deprecated",
    "npm",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "left-pad is deprecated",
    "identifier": "pkg:npm/left-pad"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "left-pad package deprecation notice",
      "url": "https://www.npmjs.com/package/left-pad"
    }
  ],
  "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/npm.json",
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen"
  }
}
</script>
