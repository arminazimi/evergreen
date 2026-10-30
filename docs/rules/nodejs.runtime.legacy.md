---
title: "Legacy Node.js runtime is end-of-life — dates, impact, migration"
description: "This Node.js release line is end-of-life and no longer receives security or bug fixes."
canonical_url: "https://arminazimi.github.io/evergreen/rules/nodejs.runtime.legacy.html"
---

# Legacy Node.js runtime is end-of-life

**End of life.** The source gives no day. Replacement: Node.js 22 LTS or later. Source: [Node.js end-of-life releases](https://nodejs.org/en/about/eol).

Check a version:

```bash
evergreen check pkg:generic/nodejs
```

This Node.js release line is end-of-life and no longer receives security or bug fixes.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | critical |
| Ecosystem | `nodejs` |
| Component | `pkg:generic/nodejs` |
| Affected versions | `vers:semver/<18.0.0` |
| Date from the source | The source gives no day |
| Replacement | Node.js 22 LTS or later |
| Evidence last seen | 2026-10-13 |
| Reviewed | 2026-10-14 by arminazimi |
| Review due | 2027-10-14 (365 days after the last review) |
| Rule ID | `nodejs.runtime.legacy` |

## Sources

- [Node.js end-of-life releases](https://nodejs.org/en/about/eol)

## Migration

**Constraints**

- Keep package metadata, local version files, CI matrices, and deployment runtimes on a mutually compatible Node.js release.
- Expect dependency and language compatibility changes when crossing multiple Node.js majors.

**Steps**

1. **Update the Node.js declaration.** Raise the reported engines or pinned runtime declaration to Node.js 22 LTS or later.
2. **Upgrade across supported majors.** Resolve dependency and runtime incompatibilities in supported-major increments before adopting the final target.
3. **Align runtime surfaces.** Update matching local version files, CI matrices, container images, and deployment configuration.

**Verification**

- `node --version`: Confirm the active Node.js runtime is supported.
- `npm run test --if-present`: Run the repository test suite on the target runtime when defined.
- `npm run build --if-present`: Verify the project builds on the target runtime.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/nodejs.json`](https://github.com/arminazimi/evergreen/blob/main/registry/nodejs.json), rule `nodejs.runtime.legacy`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/nodejs.runtime.legacy.html",
  "url": "https://arminazimi.github.io/evergreen/rules/nodejs.runtime.legacy.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/nodejs.runtime.legacy.html",
  "headline": "Legacy Node.js runtime is end-of-life — dates, impact, migration",
  "description": "This Node.js release line is end-of-life and no longer receives security or bug fixes.",
  "inLanguage": "en",
  "dateModified": "2026-10-14",
  "keywords": [
    "end-of-life",
    "nodejs",
    "critical"
  ],
  "about": {
    "@type": "Thing",
    "name": "Legacy Node.js runtime is end-of-life",
    "identifier": "pkg:generic/nodejs"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Node.js end-of-life releases",
      "url": "https://nodejs.org/en/about/eol"
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
