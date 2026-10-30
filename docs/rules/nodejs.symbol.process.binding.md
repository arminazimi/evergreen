---
title: "process.binding is deprecated — dates, impact, migration"
description: "Node.js documents process.binding() as for internal use only and deprecates it (DEP0111, documentation-only since v10.9.0); it is unavailable when the permission model is enabled."
canonical_url: "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.process.binding.html"
json_twin: "/rules/nodejs.symbol.process.binding.json"
---

# process.binding is deprecated

Node.js documents process.binding() as for internal use only and deprecates it (DEP0111, documentation-only since v10.9.0); it is unavailable when the permission model is enabled.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `nodejs` |
| Component | `pkg:generic/nodejs` |
| Affected versions | `vers:semver/>=10.9.0` |
| Date from the source | The source gives no day |
| Replacement | The public API that replaces the binding in use; the entry names no single replacement |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-10-21 (365 days after the last review) |
| Rule ID | `nodejs.symbol.process.binding` |

## Sources

- [Node.js deprecations: DEP0111 process.binding](https://nodejs.org/api/deprecations.html)

## Migration

**Constraints**

- Keep the behavior of the call unchanged; check the replacement's argument and error handling differences.

**Steps**

1. **Replace process.binding.** Identify which internal binding is requested and move to its public module, for example util.types.

**Verification**

- `npm run test --if-present`: Run the repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/nodejs.json`](https://github.com/arminazimi/evergreen/blob/main/registry/nodejs.json), rule `nodejs.symbol.process.binding`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.process.binding.html",
  "url": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.process.binding.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.process.binding.html",
  "headline": "process.binding is deprecated — dates, impact, migration",
  "description": "Node.js documents process.binding() as for internal use only and deprecates it (DEP0111, documentation-only since v10.9.0); it is unavailable when the permission model is enabled.",
  "inLanguage": "en",
  "dateModified": "2026-10-21",
  "keywords": [
    "deprecated",
    "nodejs",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "process.binding is deprecated",
    "identifier": "pkg:generic/nodejs"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Node.js deprecations: DEP0111 process.binding",
      "url": "https://nodejs.org/api/deprecations.html"
    }
  ],
  "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/nodejs.json",
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen"
  }
}
</script>
