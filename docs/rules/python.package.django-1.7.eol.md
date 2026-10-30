---
title: "Django 1.7 is end-of-life — dates, impact, migration"
description: "The Django project lists the 1.7 release series as unsupported: it no longer receives security updates or bug fixes, and its end of extended support was December 1, 2015."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.package.django-1.7.eol.html"
image: "/assets/og/python.package.django-1.7.eol.svg"
json_twin: "/rules/python.package.django-1.7.eol.json"
---

# Django 1.7 is end-of-life

**End of life** as of 2015-12-01. Replacement: Django 5.2 LTS or a newer supported release. Source: [Django supported versions](https://www.djangoproject.com/download/#supported-versions).

Check a version:

```bash
evergreen check pkg:pypi/django
```

The Django project lists the 1.7 release series as unsupported: it no longer receives security updates or bug fixes, and its end of extended support was December 1, 2015.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `python` |
| Component | `pkg:pypi/django` |
| Affected versions | `vers:pypi/>=1.7\|<1.8.dev0` |
| Date from the source | 2015-12-01 |
| Replacement | Django 5.2 LTS or a newer supported release |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-10-21 (365 days after the last review) |
| Rule ID | `python.package.django-1.7.eol` |

## Sources

- [Django supported versions](https://www.djangoproject.com/download/#supported-versions) (accessed 2026-10-21)
- [Django upgrade guide](https://docs.djangoproject.com/en/5.2/howto/upgrade-version/) (accessed 2026-10-21)

## Migration

**Constraints**

- Preserve models, migrations, settings, URL configuration, templates, and deployment configuration while changing the Django release series.
- Upgrade one feature release at a time, using the latest patch release of each series, as the Django upgrade guide recommends.
- Confirm the target Django series supports the Python release in use and that third-party packages support both Django and Python.

**Steps**

1. **Raise the Django requirement.** Change the reported Django pin or requirement from 1.7 to the next release series on the upgrade path, ending at a supported series such as 5.2 LTS, then regenerate lock files.
2. **Apply the release notes.** For each series crossed, read its release notes for backwards-incompatible changes and deprecations, resolve deprecation warnings, and update code that uses removed APIs.

**Verification**

- `python manage.py check`: Run Django's system checks against the upgraded project.
- `python -Wa manage.py test`: Run the project's test suite with deprecation warnings shown.
- `python -m pip check`: Confirm the installed distributions have no broken requirements.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.django-1.7.eol`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/python.package.django-1.7.eol.html",
      "url": "https://arminazimi.github.io/evergreen/rules/python.package.django-1.7.eol.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.django-1.7.eol.html",
      "headline": "Django 1.7 is end-of-life — dates, impact, migration",
      "description": "The Django project lists the 1.7 release series as unsupported: it no longer receives security updates or bug fixes, and its end of extended support was December 1, 2015.",
      "inLanguage": "en",
      "dateModified": "2026-10-21",
      "keywords": [
        "end-of-life",
        "python",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "Django 1.7 is end-of-life",
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
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/python.package.django-1.7.eol.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/python.package.django-1.7.eol.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:pypi/django?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life as of 2015-12-01. Affected versions: vers:pypi/>=1.7|\u003c1.8.dev0. Source: Django supported versions (https://www.djangoproject.com/download/#supported-versions)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:pypi/django?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Django 5.2 LTS or a newer supported release"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:pypi/django?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:pypi/django."
          }
        }
      ]
    }
  ]
}
</script>
