---
title: "imagej was renamed to pyimagej — dates, impact, migration"
description: "The maintainers state that the imagej Python package was renamed to pyimagej."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.package.imagej.deprecated.html"
---

# imagej was renamed to pyimagej

The maintainers state that the imagej Python package was renamed to pyimagej.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `python` |
| Component | `pkg:pypi/imagej` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | pyimagej |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.imagej.deprecated` |

## Sources

- [imagej rename notice](https://pypi.org/project/imagej/)

## Migration

**Constraints**

- Preserve ImageJ initialization, JVM options, endpoints, datasets, conversions, and headless behavior.

**Steps**

1. **Replace imagej with pyimagej.** Replace the distribution and verify imports and initialization against the current pyimagej API.

**Verification**

- `python -m pytest`: Run ImageJ integration and repository tests.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.imagej.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.package.imagej.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.package.imagej.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.imagej.deprecated.html",
  "headline": "imagej was renamed to pyimagej — dates, impact, migration",
  "description": "The maintainers state that the imagej Python package was renamed to pyimagej.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "deprecated",
    "python",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "imagej was renamed to pyimagej",
    "identifier": "pkg:pypi/imagej"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "imagej rename notice",
      "url": "https://pypi.org/project/imagej/"
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
