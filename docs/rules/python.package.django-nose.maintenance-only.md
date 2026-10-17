---
title: "django-nose is maintenance-only"
description: "The package states that it is in maintenance mode and recommends pytest or Django unittest for new projects."
---

# django-nose is maintenance-only

The package states that it is in maintenance mode and recommends pytest or Django unittest for new projects.

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

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.django-nose.maintenance-only`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
