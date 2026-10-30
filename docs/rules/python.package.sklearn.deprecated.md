---
title: "sklearn is deprecated on PyPI — dates, impact, migration"
description: "The sklearn maintainers state that the PyPI package is deprecated and that scikit-learn is the actual distribution name."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.package.sklearn.deprecated.html"
---

# sklearn is deprecated on PyPI

**Deprecated.** The source gives no day. Replacement: scikit-learn. Source: [sklearn deprecation notice](https://pypi.org/project/sklearn/).

Check a version:

```bash
evergreen check pkg:pypi/sklearn
```

The sklearn maintainers state that the PyPI package is deprecated and that scikit-learn is the actual distribution name.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | high |
| Ecosystem | `python` |
| Component | `pkg:pypi/sklearn` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | scikit-learn |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.sklearn.deprecated` |

## Sources

- [sklearn deprecation notice](https://pypi.org/project/sklearn/)

## Migration

**Constraints**

- Keep Python imports as sklearn; only the distribution name used by installers and dependency metadata changes.

**Steps**

1. **Replace the distribution name.** Replace sklearn with scikit-learn in dependency declarations and installation commands without renaming sklearn imports.
2. **Refresh the environment.** Regenerate lock data and confirm the intended scikit-learn version resolves for every supported Python runtime.

**Verification**

- `python -m pip check`: Check the resolved scikit-learn environment.
- `python -m pytest`: Run model, preprocessing, and repository tests.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.sklearn.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.package.sklearn.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.package.sklearn.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.sklearn.deprecated.html",
  "headline": "sklearn is deprecated on PyPI — dates, impact, migration",
  "description": "The sklearn maintainers state that the PyPI package is deprecated and that scikit-learn is the actual distribution name.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "deprecated",
    "python",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "sklearn is deprecated on PyPI",
    "identifier": "pkg:pypi/sklearn"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "sklearn deprecation notice",
      "url": "https://pypi.org/project/sklearn/"
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
