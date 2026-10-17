---
title: "nose is maintenance-only"
description: "The project warns that nose has been in maintenance mode for years and recommends alternatives for new projects."
---

# nose is maintenance-only

The project warns that nose has been in maintenance mode for years and recommends alternatives for new projects.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | high |
| Ecosystem | `python` |
| Component | `pkg:pypi/nose` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | pytest, nose2, or unittest |
| Evidence last seen | 2026-10-14 |
| Reviewed | 2026-10-14 by arminazimi |
| Review due | 2027-10-14 (365 days after the last review) |
| Rule ID | `python.package.nose.maintenance-only` |

## Sources

- [nose note to users](https://nose.readthedocs.io/en/latest/)

## Migration

**Constraints**

- Choose one target test runner before editing tests and preserve discovery rules, fixtures, setup/teardown behavior, plugins, and command-line options.

**Steps**

1. **Choose the target runner.** Select pytest, nose2, or unittest based on the suite features and existing project tooling.
2. **Migrate nose usages.** Replace reported imports, runner calls, test_suite configuration, and nose-specific assertions or plugins.
3. **Replace the dependency.** Remove nose from dependency declarations and add the selected runner and required plugins.

**Verification**

- `python -m pytest`: Run the migrated test suite with pytest when selected.
- `python -m unittest discover`: Check standard-library test discovery when applicable.
- `python -m pip check`: Check installed dependency compatibility.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.nose.maintenance-only`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.package.nose.maintenance-only.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.package.nose.maintenance-only.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.nose.maintenance-only.html",
  "headline": "nose is maintenance-only",
  "description": "The project warns that nose has been in maintenance mode for years and recommends alternatives for new projects.",
  "inLanguage": "en",
  "dateModified": "2026-10-14",
  "keywords": [
    "deprecated",
    "python",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "nose is maintenance-only",
    "identifier": "pkg:pypi/nose"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "nose note to users",
      "url": "https://nose.readthedocs.io/en/latest/"
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
