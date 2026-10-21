---
title: "Django 1.10 is end-of-life — dates, impact, migration"
description: "The Django project lists the 1.10 release series as unsupported: it no longer receives security updates or bug fixes, and its end of extended support was December 2, 2017."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.package.django-1.10.eol.html"
---

# Django 1.10 is end-of-life

The Django project lists the 1.10 release series as unsupported: it no longer receives security updates or bug fixes, and its end of extended support was December 2, 2017.

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `python` |
| Component | `pkg:pypi/django` |
| Affected versions | `vers:pypi/>=1.10\|<1.11.dev0` |
| Date from the source | 2017-12-02 |
| Replacement | Django 5.2 LTS or a newer supported release |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-10-21 (365 days after the last review) |
| Rule ID | `python.package.django-1.10.eol` |

## Sources

- [Django supported versions](https://www.djangoproject.com/download/#supported-versions)
- [Django 1.10 release notes (1.10.8)](https://docs.djangoproject.com/en/1.10/releases/1.10.8/)
- [Django upgrade guide](https://docs.djangoproject.com/en/5.2/howto/upgrade-version/)

## Migration

**Constraints**

- Preserve models, migrations, settings, URL configuration, templates, and deployment configuration while changing the Django release series.
- Upgrade one feature release at a time, using the latest patch release of each series, as the Django upgrade guide recommends.
- Confirm the target Django series supports the Python release in use and that third-party packages support both Django and Python.

**Steps**

1. **Raise the Django requirement.** Change the reported Django pin or requirement from 1.10 to the next release series on the upgrade path, ending at a supported series such as 5.2 LTS, then regenerate lock files.
2. **Apply the release notes.** For each series crossed, read its release notes for backwards-incompatible changes and deprecations, resolve deprecation warnings, and update code that uses removed APIs.

**Verification**

- `python manage.py check`: Run Django's system checks against the upgraded project.
- `python -Wa manage.py test`: Run the project's test suite with deprecation warnings shown.
- `python -m pip check`: Confirm the installed distributions have no broken requirements.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.django-1.10.eol`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.package.django-1.10.eol.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.package.django-1.10.eol.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.django-1.10.eol.html",
  "headline": "Django 1.10 is end-of-life — dates, impact, migration",
  "description": "The Django project lists the 1.10 release series as unsupported: it no longer receives security updates or bug fixes, and its end of extended support was December 2, 2017.",
  "inLanguage": "en",
  "dateModified": "2026-10-21",
  "keywords": [
    "end-of-life",
    "python",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Django 1.10 is end-of-life",
    "identifier": "pkg:pypi/django"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Django supported versions",
      "url": "https://www.djangoproject.com/download/#supported-versions"
    },
    {
      "@type": "CreativeWork",
      "name": "Django 1.10 release notes (1.10.8)",
      "url": "https://docs.djangoproject.com/en/1.10/releases/1.10.8/"
    },
    {
      "@type": "CreativeWork",
      "name": "Django upgrade guide",
      "url": "https://docs.djangoproject.com/en/5.2/howto/upgrade-version/"
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
