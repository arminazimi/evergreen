---
title: "vsdeband is deprecated — dates, impact, migration"
description: "The maintainer marks vsdeband as deprecated and directs users to the vsjetpack package."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.package.vsdeband.deprecated.html"
json_twin: "/rules/python.package.vsdeband.deprecated.json"
---

# vsdeband is deprecated

**Deprecated.** The source gives no day. Replacement: vsjetpack. Source: [vsdeband deprecation notice](https://pypi.org/project/vsdeband/).

Check a version:

```bash
evergreen check pkg:pypi/vsdeband
```

The maintainer marks vsdeband as deprecated and directs users to the vsjetpack package.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `python` |
| Component | `pkg:pypi/vsdeband` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | vsjetpack |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.vsdeband.deprecated` |

## Sources

- [vsdeband deprecation notice](https://pypi.org/project/vsdeband/)

## Migration

**Constraints**

- Preserve filter selection, thresholds, planes, grain behavior, frame formats, and rendered video output.

**Steps**

1. **Replace vsdeband.** Replace the dependency and translate vsdeband imports and filter calls to their vsjetpack equivalents.
2. **Compare rendered output.** Render representative clips and compare frame properties and visual output around gradients and motion.

**Verification**

- `python -m pytest`: Run video-processing and repository tests when defined.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.vsdeband.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.package.vsdeband.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.package.vsdeband.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.vsdeband.deprecated.html",
  "headline": "vsdeband is deprecated — dates, impact, migration",
  "description": "The maintainer marks vsdeband as deprecated and directs users to the vsjetpack package.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "deprecated",
    "python",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "vsdeband is deprecated",
    "identifier": "pkg:pypi/vsdeband"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "vsdeband deprecation notice",
      "url": "https://pypi.org/project/vsdeband/"
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
