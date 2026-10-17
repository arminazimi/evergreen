---
title: "multimodal-timesfm is no longer maintained"
description: "The maintainer states that multimodal-timesfm was renamed and is no longer maintained under that name."
---

# multimodal-timesfm is no longer maintained

The maintainer states that multimodal-timesfm was renamed and is no longer maintained under that name.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `python` |
| Component | `pkg:pypi/multimodal-timesfm` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | tsfmx |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.multimodal-timesfm.deprecated` |

## Sources

- [multimodal-timesfm rename notice](https://pypi.org/project/multimodal-timesfm/)

## Migration

**Constraints**

- Preserve model identifiers, checkpoints, preprocessing, forecast horizons, covariates, device selection, and output shapes.

**Steps**

1. **Replace multimodal-timesfm.** Replace the distribution and translate imports, model loading, and forecast calls to tsfmx.
2. **Compare forecast behavior.** Run pinned fixtures through both packages and compare shapes, missing-value handling, and forecast tolerances.

**Verification**

- `python -m pytest`: Run forecasting and repository tests when defined.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.multimodal-timesfm.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.package.multimodal-timesfm.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.package.multimodal-timesfm.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.multimodal-timesfm.deprecated.html",
  "headline": "multimodal-timesfm is no longer maintained",
  "description": "The maintainer states that multimodal-timesfm was renamed and is no longer maintained under that name.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "deprecated",
    "python",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "multimodal-timesfm is no longer maintained",
    "identifier": "pkg:pypi/multimodal-timesfm"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "multimodal-timesfm rename notice",
      "url": "https://pypi.org/project/multimodal-timesfm/"
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
