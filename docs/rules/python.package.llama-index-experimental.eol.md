---
title: "llama-index-experimental is no longer maintained — dates, impact, migration"
description: "The maintainer states that llama-index-experimental is deprecated, no longer maintained, and will receive no further updates or bug fixes."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.package.llama-index-experimental.eol.html"
json_twin: "/rules/python.package.llama-index-experimental.eol.json"
---

# llama-index-experimental is no longer maintained

**End of life.** The source gives no day. Source: [llama-index-experimental lifecycle notice](https://pypi.org/project/llama-index-experimental/).

Check a version:

```bash
evergreen check pkg:pypi/llama-index-experimental
```

The maintainer states that llama-index-experimental is deprecated, no longer maintained, and will receive no further updates or bug fixes.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `python` |
| Component | `pkg:pypi/llama-index-experimental` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.llama-index-experimental.eol` |

## Sources

- [llama-index-experimental lifecycle notice](https://pypi.org/project/llama-index-experimental/)

## Migration

**Constraints**

- Preserve data connectors, indexes, query behavior, prompts, model configuration, serialization, and observability used by the application.

**Steps**

1. **Replace experimental integrations.** Inventory the experimental APIs in use, select maintained LlamaIndex or alternative implementations for each, migrate call sites, then remove the package.

**Verification**

- `python -m pytest`: Run indexing, retrieval, generation, persistence, and project tests when defined.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.llama-index-experimental.eol`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.package.llama-index-experimental.eol.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.package.llama-index-experimental.eol.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.llama-index-experimental.eol.html",
  "headline": "llama-index-experimental is no longer maintained — dates, impact, migration",
  "description": "The maintainer states that llama-index-experimental is deprecated, no longer maintained, and will receive no further updates or bug fixes.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "end-of-life",
    "python",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "llama-index-experimental is no longer maintained",
    "identifier": "pkg:pypi/llama-index-experimental"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "llama-index-experimental lifecycle notice",
      "url": "https://pypi.org/project/llama-index-experimental/"
    }
  ],
  "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/python.json",
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen"
  }
}
</script>
