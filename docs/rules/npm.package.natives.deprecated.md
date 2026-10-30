---
title: "natives is deprecated — dates, impact, migration"
description: "npm states that natives relies on Node.js internals and will break, and directs users to graceful-fs 4.x."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.natives.deprecated.html"
---

# natives is deprecated

**Deprecated.** The source gives no day. Replacement: graceful-fs 4.x. Source: [natives package deprecation notice](https://www.npmjs.com/package/natives).

Check a version:

```bash
evergreen check pkg:npm/natives
```

npm states that natives relies on Node.js internals and will break, and directs users to graceful-fs 4.x.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | high |
| Ecosystem | `npm` |
| Component | `pkg:npm/natives` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | graceful-fs 4.x |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.natives.deprecated` |

## Sources

- [natives package deprecation notice](https://www.npmjs.com/package/natives)
- [natives registry metadata](https://registry.npmjs.org/natives/latest)

## Migration

**Constraints**

- Preserve filesystem behavior, retry semantics, and compatibility with the Node.js versions supported by the project.

**Steps**

1. **Replace natives.** Replace the natives dependency and imports with graceful-fs 4.x, using its public filesystem API instead of Node.js internals.
2. **Verify filesystem behavior.** Exercise affected file operations, including concurrent access and error paths, on every supported Node.js version.

**Verification**

- `npm run test --if-present`: Run filesystem behavior and repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.natives.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.natives.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.natives.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.natives.deprecated.html",
  "headline": "natives is deprecated — dates, impact, migration",
  "description": "npm states that natives relies on Node.js internals and will break, and directs users to graceful-fs 4.x.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "deprecated",
    "npm",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "natives is deprecated",
    "identifier": "pkg:npm/natives"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "natives package deprecation notice",
      "url": "https://www.npmjs.com/package/natives"
    },
    {
      "@type": "CreativeWork",
      "name": "natives registry metadata",
      "url": "https://registry.npmjs.org/natives/latest"
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
