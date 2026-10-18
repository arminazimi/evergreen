---
title: "Node.js 19 is end-of-life — dates, impact, migration"
description: "Node.js 19 no longer receives security or bug fixes."
canonical_url: "https://arminazimi.github.io/evergreen/rules/nodejs.runtime.eol-19.html"
---

# Node.js 19 is end-of-life

Node.js 19 no longer receives security or bug fixes.

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `nodejs` |
| Component | `pkg:generic/nodejs` |
| Affected versions | `vers:semver/>=19.0.0\|<20.0.0` |
| Date from the source | 2023-06-01 |
| Replacement | Node.js 22 LTS or later |
| Evidence last seen | 2026-10-17 |
| Reviewed | 2026-10-17 by arminazimi, drafted by the `nodejs-schedule` importer |
| Review due | 2027-10-17 (365 days after the last review) |
| Rule ID | `nodejs.runtime.eol-19` |

## Sources

- [Node.js Release Working Group schedule](https://github.com/nodejs/Release/blob/main/schedule.json)

## Migration

**Constraints**

- Keep package metadata, local version files, CI matrices, and deployment runtimes on a mutually compatible Node.js release.
- Confirm native modules and production dependencies support the target Node.js major.

**Steps**

1. **Update the Node.js declaration.** Raise the reported engines or pinned runtime declaration to Node.js 22 LTS or later.
2. **Align runtime surfaces.** Update matching local version files, CI matrices, container images, and deployment configuration.

**Verification**

- `node --version`: Confirm the active Node.js runtime is supported.
- `npm run test --if-present`: Run the repository test suite on the target runtime when defined.
- `npm run build --if-present`: Verify the project builds on the target runtime.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/nodejs.json`](https://github.com/arminazimi/evergreen/blob/main/registry/nodejs.json), rule `nodejs.runtime.eol-19`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/nodejs.runtime.eol-19.html",
  "url": "https://arminazimi.github.io/evergreen/rules/nodejs.runtime.eol-19.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/nodejs.runtime.eol-19.html",
  "headline": "Node.js 19 is end-of-life — dates, impact, migration",
  "description": "Node.js 19 no longer receives security or bug fixes.",
  "inLanguage": "en",
  "dateModified": "2026-10-17",
  "keywords": [
    "end-of-life",
    "nodejs",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Node.js 19 is end-of-life",
    "identifier": "pkg:generic/nodejs"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Node.js Release Working Group schedule",
      "url": "https://github.com/nodejs/Release/blob/main/schedule.json"
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
