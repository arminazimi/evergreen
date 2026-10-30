---
title: "django-nose is maintenance-only — dates, impact, migration"
description: "The package states that it is in maintenance mode and recommends pytest or Django unittest for new projects."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.package.django-nose.maintenance-only.html"
---

# django-nose is maintenance-only

**Deprecated.** The source gives no day. Replacement: pytest-django or Django unittest. Source: [django-nose project notice](https://pypi.org/project/django-nose/).

Check a version:

```bash
evergreen check pkg:pypi/django-nose
```

The package states that it is in maintenance mode and recommends pytest or Django unittest for new projects.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | high |
| Ecosystem | `python` |
| Component | `pkg:pypi/django-nose` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | pytest-django or Django unittest |
| Evidence last seen | 2026-10-14 |
| Reviewed | 2026-10-14 by arminazimi |
| Review due | 2027-10-14 (365 days after the last review) |
| Rule ID | `python.package.django-nose.maintenance-only` |

## Sources

- [django-nose project notice](https://pypi.org/project/django-nose/)

## Migration

**Constraints**

- Preserve Django settings selection, database setup, fixture loading, test labels, and any django-nose plugin behavior.

**Steps**

1. **Choose the Django test runner.** Select pytest-django or Django's built-in test runner and document the chosen invocation.
2. **Migrate runner configuration.** Replace TEST_RUNNER, imports, plugins, and django-nose-specific options at every reported usage.
3. **Replace the dependency.** Remove django-nose and add only the target runner and plugins required by the suite.

**Verification**

- `python manage.py test`: Run Django's configured test suite.
- `python -m pytest`: Run the suite through pytest-django when selected.
- `python -m pip check`: Check installed dependency compatibility.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.django-nose.maintenance-only`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.package.django-nose.maintenance-only.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.package.django-nose.maintenance-only.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.django-nose.maintenance-only.html",
  "headline": "django-nose is maintenance-only — dates, impact, migration",
  "description": "The package states that it is in maintenance mode and recommends pytest or Django unittest for new projects.",
  "inLanguage": "en",
  "dateModified": "2026-10-14",
  "keywords": [
    "deprecated",
    "python",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "django-nose is maintenance-only",
    "identifier": "pkg:pypi/django-nose"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "django-nose project notice",
      "url": "https://pypi.org/project/django-nose/"
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
