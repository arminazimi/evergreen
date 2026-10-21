---
title: "Module.register is deprecated — dates, impact, migration"
description: "Node.js deprecates module.register (DEP0205: documentation-only since v25.9.0, runtime deprecation since v26.0.0)."
canonical_url: "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.module.register.html"
---

# Module.register is deprecated

Node.js deprecates module.register (DEP0205: documentation-only since v25.9.0, runtime deprecation since v26.0.0).

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `nodejs` |
| Component | `pkg:generic/nodejs` |
| Affected versions | `vers:semver/>=25.9.0` |
| Date from the source | The source gives no day |
| Replacement | module.registerHooks() |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-10-21 (365 days after the last review) |
| Rule ID | `nodejs.symbol.module.register` |

## Sources

- [Node.js deprecations: DEP0205](https://nodejs.org/api/deprecations.html)

## Migration

**Constraints**

- Keep the behavior of the code unchanged; check the replacement's argument and return-value differences.

**Steps**

1. **Replace the usage.** Replace each reported use of module.register with module.registerHooks().

**Verification**

- `npm run test --if-present`: Run the repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/nodejs.json`](https://github.com/arminazimi/evergreen/blob/main/registry/nodejs.json), rule `nodejs.symbol.module.register`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.module.register.html",
  "url": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.module.register.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.module.register.html",
  "headline": "Module.register is deprecated — dates, impact, migration",
  "description": "Node.js deprecates module.register (DEP0205: documentation-only since v25.9.0, runtime deprecation since v26.0.0).",
  "inLanguage": "en",
  "dateModified": "2026-10-21",
  "keywords": [
    "deprecated",
    "nodejs",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "Module.register is deprecated",
    "identifier": "pkg:generic/nodejs"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Node.js deprecations: DEP0205",
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
