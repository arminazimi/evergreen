---
title: "poetry-version-plugin is deprecated"
description: "The maintainer states that poetry-version-plugin is deprecated and recommends migrating to other project and versioning tools."
---

# poetry-version-plugin is deprecated

The maintainer states that poetry-version-plugin is deprecated and recommends migrating to other project and versioning tools.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `python` |
| Component | `pkg:pypi/poetry-version-plugin` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | uv, PDM, Hatch, or poetry-dynamic-versioning |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.poetry-version-plugin.deprecated` |

## Sources

- [poetry-version-plugin deprecation notice](https://pypi.org/project/poetry-version-plugin/)

## Migration

**Constraints**

- Preserve the version source, tag format, source-tree state, built metadata, editable installs, and release automation.

**Steps**

1. **Replace dynamic versioning.** Choose a maintained versioning workflow, migrate Poetry configuration and release jobs, and remove poetry-version-plugin.

**Verification**

- `python -m build`: Build distributions and inspect their resolved versions.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.poetry-version-plugin.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.package.poetry-version-plugin.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.package.poetry-version-plugin.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.poetry-version-plugin.deprecated.html",
  "headline": "poetry-version-plugin is deprecated",
  "description": "The maintainer states that poetry-version-plugin is deprecated and recommends migrating to other project and versioning tools.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "deprecated",
    "python",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "poetry-version-plugin is deprecated",
    "identifier": "pkg:pypi/poetry-version-plugin"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "poetry-version-plugin deprecation notice",
      "url": "https://pypi.org/project/poetry-version-plugin/"
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
