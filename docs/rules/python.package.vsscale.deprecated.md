---
title: "vsscale is deprecated — dates, impact, migration"
description: "The maintainer states that vsscale is deprecated and directs users to vsjetpack."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.package.vsscale.deprecated.html"
---

# vsscale is deprecated

The maintainer states that vsscale is deprecated and directs users to vsjetpack.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `python` |
| Component | `pkg:pypi/vsscale` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | vsjetpack |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.vsscale.deprecated` |

## Sources

- [vsscale deprecation notice](https://pypi.org/project/vsscale/)

## Migration

**Constraints**

- Preserve scaling kernels, descaling behavior, clip formats, dimensions, chroma handling, and VapourSynth frame output.

**Steps**

1. **Move to vsjetpack.** Replace vsscale with vsjetpack and translate scaling and descaling imports and calls to the maintained APIs.

**Verification**

- `python -m pytest`: Run VapourSynth scaling, format, dimension, and project tests when defined.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.vsscale.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.package.vsscale.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.package.vsscale.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.vsscale.deprecated.html",
  "headline": "vsscale is deprecated — dates, impact, migration",
  "description": "The maintainer states that vsscale is deprecated and directs users to vsjetpack.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "deprecated",
    "python",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "vsscale is deprecated",
    "identifier": "pkg:pypi/vsscale"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "vsscale deprecation notice",
      "url": "https://pypi.org/project/vsscale/"
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
