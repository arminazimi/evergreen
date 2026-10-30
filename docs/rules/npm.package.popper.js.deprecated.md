---
title: "popper.js is deprecated — dates, impact, migration"
description: "npm identifies popper.js as the legacy Popper v1 package and directs users to @popperjs/core for Popper v2."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.popper.js.deprecated.html"
json_twin: "/rules/npm.package.popper.js.deprecated.json"
---

# popper.js is deprecated

**Deprecated.** The source gives no day. Replacement: @popperjs/core. Source: [popper.js package deprecation notice](https://www.npmjs.com/package/popper.js).

Check a version:

```bash
evergreen check pkg:npm/popper.js
```

npm identifies popper.js as the legacy Popper v1 package and directs users to @popperjs/core for Popper v2.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/popper.js` |
| Affected versions | `vers:npm/0.2.0\|0.2.1\|0.2.2\|0.2.3\|0.2.4\|0.2.5\|0.2.6\|0.3.0\|0.3.1\|0.3.2\|0.3.3\|0.3.4\|0.3.5\|0.3.6\|0.3.7\|0.3.8\|0.4.0\|0.4.1\|0.4.2\|0.5.0\|0.5.1\|0.5.2\|0.5.3\|0.6.0\|0.6.1\|0.6.2\|0.6.3\|0.6.4\|1.0.0\|1.0.1\|1.0.2\|1.0.3\|1.0.4\|1.0.5\|1.0.6\|1.0.7\|1.0.8\|1.5.0\|1.5.1\|1.5.2\|1.6.0\|1.7.0\|1.8.0\|1.8.1\|1.8.2\|1.8.3\|1.8.4\|1.8.5\|1.8.6\|1.9.0\|1.9.1\|1.9.2\|1.9.3\|1.9.4\|1.9.5\|1.9.6\|1.9.7\|1.9.8\|1.9.9\|1.10.0\|1.10.1\|1.10.2\|1.10.3\|1.10.4\|1.10.5\|1.10.6\|1.10.7\|1.10.8\|1.11.0\|1.11.1\|1.12.0\|1.12.1\|1.12.2\|1.12.3\|1.12.4\|1.12.5\|1.12.6\|1.12.7\|1.12.8\|1.12.9\|1.13.0\|1.14.0\|1.14.1\|1.14.2\|1.14.3\|1.14.4\|1.14.5\|1.14.6\|1.14.7\|1.15.0\|1.16.0\|1.16.1` |
| Date from the source | The source gives no day |
| Replacement | @popperjs/core |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `npm.package.popper.js.deprecated` |

## Sources

- [popper.js package deprecation notice](https://www.npmjs.com/package/popper.js)
- [popper.js version metadata](https://registry.npmjs.org/popper.js)

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

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.popper.js.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.popper.js.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.popper.js.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.popper.js.deprecated.html",
  "headline": "popper.js is deprecated — dates, impact, migration",
  "description": "npm identifies popper.js as the legacy Popper v1 package and directs users to @popperjs/core for Popper v2.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "deprecated",
    "npm",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "popper.js is deprecated",
    "identifier": "pkg:npm/popper.js"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "popper.js package deprecation notice",
      "url": "https://www.npmjs.com/package/popper.js"
    },
    {
      "@type": "CreativeWork",
      "name": "popper.js version metadata",
      "url": "https://registry.npmjs.org/popper.js"
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
