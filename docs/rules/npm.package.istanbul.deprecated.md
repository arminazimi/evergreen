---
title: "istanbul is deprecated — dates, impact, migration"
description: "npm states that istanbul is no longer maintained and recommends nyc."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.istanbul.deprecated.html"
json_twin: "/rules/npm.package.istanbul.deprecated.json"
---

# istanbul is deprecated

**Deprecated.** The source gives no day. Replacement: nyc. Source: [istanbul package deprecation notice](https://www.npmjs.com/package/istanbul).

Check a version:

```bash
evergreen check pkg:npm/istanbul
```

npm states that istanbul is no longer maintained and recommends nyc.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/istanbul` |
| Affected versions | `vers:npm/0.1.0\|0.1.1\|0.1.2\|0.1.3\|0.1.4\|0.1.5\|0.1.6\|0.1.7\|0.1.8\|0.1.9\|0.1.10\|0.1.11\|0.1.12\|0.1.13\|0.1.14\|0.1.15\|0.1.16\|0.1.17\|0.1.18\|0.1.19\|0.1.20\|0.1.21\|0.1.22\|0.1.23\|0.1.24\|0.1.25\|0.1.26\|0.1.27\|0.1.28\|0.1.29\|0.1.30\|0.1.31\|0.1.32\|0.1.33\|0.1.34\|0.1.35\|0.1.36\|0.1.37\|0.1.38\|0.1.39\|0.1.40\|0.1.41\|0.1.42\|0.1.43\|0.1.44\|0.1.45\|0.1.46\|0.2.0\|0.2.1\|0.2.2\|0.2.3\|0.2.4\|0.2.5\|0.2.6\|0.2.7\|0.2.8\|0.2.9\|0.2.10\|0.2.11\|0.2.12\|0.2.13\|0.2.14\|0.2.15\|0.2.16\|0.3.0\|0.3.1\|0.3.2\|0.3.3\|0.3.4\|0.3.5\|0.3.6\|0.3.7\|0.3.8\|0.3.9\|0.3.10\|0.3.11\|0.3.13\|0.3.14\|0.3.15\|0.3.16\|0.3.17\|0.3.18\|0.3.19\|0.3.20\|0.3.21\|0.3.22\|0.4.0\|0.4.1\|0.4.2\|0.4.3\|0.4.4\|0.4.5` |
| Date from the source | The source gives no day |
| Replacement | nyc |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.istanbul.deprecated` |

## Sources

- [istanbul package deprecation notice](https://www.npmjs.com/package/istanbul)
- [istanbul version metadata](https://registry.npmjs.org/istanbul)

## Migration

**Constraints**

- Preserve test execution, include and exclude patterns, source maps, reporters, and coverage thresholds.

**Steps**

1. **Replace Istanbul CLI.** Replace istanbul with nyc in dependencies, scripts, and coverage configuration.
2. **Compare coverage output.** Run the same test suite and compare covered files, reporters, and enforced thresholds.

**Verification**

- `npm run test --if-present`: Run the instrumented test suite and coverage checks.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.istanbul.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.istanbul.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.istanbul.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.istanbul.deprecated.html",
  "headline": "istanbul is deprecated — dates, impact, migration",
  "description": "npm states that istanbul is no longer maintained and recommends nyc.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "deprecated",
    "npm",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "istanbul is deprecated",
    "identifier": "pkg:npm/istanbul"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "istanbul package deprecation notice",
      "url": "https://www.npmjs.com/package/istanbul"
    },
    {
      "@type": "CreativeWork",
      "name": "istanbul version metadata",
      "url": "https://registry.npmjs.org/istanbul"
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
