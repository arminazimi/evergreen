---
title: "BatchNotebook is deprecated — dates, impact, migration"
description: "The maintainer says not to use BatchNotebook, marks it deprecated, and recommends runipy."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.package.batchnotebook.deprecated.html"
json_twin: "/rules/python.package.batchnotebook.deprecated.json"
---

# BatchNotebook is deprecated

**Deprecated.** The source gives no day. Replacement: runipy. Source: [BatchNotebook deprecation notice](https://pypi.org/project/BatchNotebook/).

Check a version:

```bash
evergreen check pkg:pypi/batchnotebook
```

The maintainer says not to use BatchNotebook, marks it deprecated, and recommends runipy.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `python` |
| Component | `pkg:pypi/batchnotebook` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | runipy |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.batchnotebook.deprecated` |

## Sources

- [BatchNotebook deprecation notice](https://pypi.org/project/BatchNotebook/)

## Migration

**Constraints**

- Preserve notebook input and output paths, cell execution order, timeouts, errors, kernel selection, and rendered report artifacts.

**Steps**

1. **Replace BatchNotebook.** Move notebook execution to runipy as recommended by the maintainer, or to the maintained notebook execution facility selected by the project, then remove BatchNotebook.

**Verification**

- `python -m pytest`: Run notebook execution, timeout, failure, output, and project tests when defined.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.batchnotebook.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.package.batchnotebook.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.package.batchnotebook.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.batchnotebook.deprecated.html",
  "headline": "BatchNotebook is deprecated — dates, impact, migration",
  "description": "The maintainer says not to use BatchNotebook, marks it deprecated, and recommends runipy.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "deprecated",
    "python",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "BatchNotebook is deprecated",
    "identifier": "pkg:pypi/batchnotebook"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "BatchNotebook deprecation notice",
      "url": "https://pypi.org/project/BatchNotebook/"
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
