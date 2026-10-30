---
title: "django-celery is no longer required — dates, impact, migration"
description: "The project states that django-celery is no longer required because Celery supports Django directly."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.package.django-celery.deprecated.html"
json_twin: "/rules/python.package.django-celery.deprecated.json"
---

# django-celery is no longer required

**Deprecated.** The source gives no day. Replacement: Celery's built-in Django integration. Source: [django-celery retirement notice](https://pypi.org/project/django-celery/).

Check a version:

```bash
evergreen check pkg:pypi/django-celery
```

The project states that django-celery is no longer required because Celery supports Django directly.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | high |
| Ecosystem | `python` |
| Component | `pkg:pypi/django-celery` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | Celery's built-in Django integration |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.django-celery.deprecated` |

## Sources

- [django-celery retirement notice](https://pypi.org/project/django-celery/)

## Migration

**Constraints**

- Preserve task discovery, broker and result settings, periodic schedules, worker startup, retries, and Django application initialization.

**Steps**

1. **Adopt Celery's Django integration.** Configure the Celery application using the current Django integration and translate djcelery settings and setup calls.
2. **Remove django-celery.** Remove django-celery and djcelery from dependencies, installed applications, imports, commands, and migrations after data needs are resolved.

**Verification**

- `python -m pytest`: Run task, scheduling, result-backend, and repository tests.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.django-celery.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.package.django-celery.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.package.django-celery.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.django-celery.deprecated.html",
  "headline": "django-celery is no longer required — dates, impact, migration",
  "description": "The project states that django-celery is no longer required because Celery supports Django directly.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "deprecated",
    "python",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "django-celery is no longer required",
    "identifier": "pkg:pypi/django-celery"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "django-celery retirement notice",
      "url": "https://pypi.org/project/django-celery/"
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
