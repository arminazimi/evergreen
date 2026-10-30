---
title: "@npmcli/move-file is deprecated — dates, impact, migration"
description: "npm states that @npmcli/move-file functionality moved to @npmcli/fs."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.npmcli-move-file.deprecated.html"
json_twin: "/rules/npm.package.npmcli-move-file.deprecated.json"
---

# @npmcli/move-file is deprecated

**Deprecated.** The source gives no day. Replacement: @npmcli/fs. Source: [@npmcli/move-file package deprecation notice](https://www.npmjs.com/package/@npmcli/move-file).

Check a version:

```bash
evergreen check pkg:npm/%40npmcli/move-file
```

npm states that @npmcli/move-file functionality moved to @npmcli/fs.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/%40npmcli/move-file` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | @npmcli/fs |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.npmcli-move-file.deprecated` |

## Sources

- [@npmcli/move-file package deprecation notice](https://www.npmjs.com/package/@npmcli/move-file)
- [@npmcli/move-file registry metadata](https://registry.npmjs.org/@npmcli%2Fmove-file/latest)

## Migration

**Constraints**

- Preserve overwrite, cross-device fallback, directory creation, permissions, error propagation, and platform-specific move behavior.

**Steps**

1. **Move to @npmcli/fs.** Replace the dependency and imports with the move-file functionality exposed by @npmcli/fs, adapting changed exports and options.

**Verification**

- `npm run test --if-present`: Run same-device, cross-device, overwrite, failure, and repository tests.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.npmcli-move-file.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.npmcli-move-file.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.npmcli-move-file.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.npmcli-move-file.deprecated.html",
  "headline": "@npmcli/move-file is deprecated — dates, impact, migration",
  "description": "npm states that @npmcli/move-file functionality moved to @npmcli/fs.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "deprecated",
    "npm",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "@npmcli/move-file is deprecated",
    "identifier": "pkg:npm/%40npmcli/move-file"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "@npmcli/move-file package deprecation notice",
      "url": "https://www.npmjs.com/package/@npmcli/move-file"
    },
    {
      "@type": "CreativeWork",
      "name": "@npmcli/move-file registry metadata",
      "url": "https://registry.npmjs.org/@npmcli%2Fmove-file/latest"
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
