---
title: "Is Django end of life? — versions, dates, sources"
description: "Some Django releases are end of life. Django 4.2 LTS is end-of-life as of 2026-04-07. This page lists 20 reviewed lifecycle rules for pkg:pypi/django, with the status, date, and source for each."
canonical_url: "https://arminazimi.github.io/evergreen/eol/django.html"
---

# Is Django end of life?

**Some Django releases are end of life.** Django 4.2 LTS is end-of-life as of 2026-04-07. This page lists 20 reviewed lifecycle rules for `pkg:pypi/django`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:pypi/django
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [Django 4.2 LTS is end-of-life](../rules/python.package.django-4.2.eol.html) | End of life | 2026-04-07 | `vers:pypi/>=4.2\|<5.0.dev0` | [Django supported versions](https://www.djangoproject.com/download/#supported-versions), [Django 4.2 release notes (4.2.30)](https://docs.djangoproject.com/en/4.2/releases/4.2.30/), [Django upgrade guide](https://docs.djangoproject.com/en/5.2/howto/upgrade-version/) |
| [Django 5.1 is end-of-life](../rules/python.package.django-5.1.eol.html) | End of life | 2025-12-03 | `vers:pypi/>=5.1\|<5.2.dev0` | [Django supported versions](https://www.djangoproject.com/download/#supported-versions), [Django 5.1 release notes (5.1.15)](https://docs.djangoproject.com/en/5.1/releases/5.1.15/), [Django upgrade guide](https://docs.djangoproject.com/en/5.2/howto/upgrade-version/) |
| [Django 5.0 is end-of-life](../rules/python.package.django-5.0.eol.html) | End of life | 2025-04-02 | `vers:pypi/>=5.0\|<5.1.dev0` | [Django supported versions](https://www.djangoproject.com/download/#supported-versions), [Django 5.0 release notes (5.0.14)](https://docs.djangoproject.com/en/5.0/releases/5.0.14/), [Django upgrade guide](https://docs.djangoproject.com/en/5.2/howto/upgrade-version/) |
| [Django 3.2 LTS is end-of-life](../rules/python.package.django-3.2.eol.html) | End of life | 2024-04-01 | `vers:pypi/>=3.2\|<4.0.dev0` | [Django supported versions](https://www.djangoproject.com/download/#supported-versions), [Django 3.2 release notes (3.2.25)](https://docs.djangoproject.com/en/3.2/releases/3.2.25/), [Django upgrade guide](https://docs.djangoproject.com/en/5.2/howto/upgrade-version/) |
| [Django 4.1 is end-of-life](../rules/python.package.django-4.1.eol.html) | End of life | 2023-12-01 | `vers:pypi/>=4.1\|<4.2.dev0` | [Django supported versions](https://www.djangoproject.com/download/#supported-versions), [Django 4.1 release notes (4.1.13)](https://docs.djangoproject.com/en/4.1/releases/4.1.13/), [Django upgrade guide](https://docs.djangoproject.com/en/5.2/howto/upgrade-version/) |
| [Django 4.0 is end-of-life](../rules/python.package.django-4.0.eol.html) | End of life | 2023-04-01 | `vers:pypi/>=4.0\|<4.1.dev0` | [Django supported versions](https://www.djangoproject.com/download/#supported-versions), [Django 4.0 release notes (4.0.10)](https://docs.djangoproject.com/en/4.0/releases/4.0.10/), [Django upgrade guide](https://docs.djangoproject.com/en/5.2/howto/upgrade-version/) |
| [Django 2.2 LTS is end-of-life](../rules/python.package.django-2.2.eol.html) | End of life | 2022-04-11 | `vers:pypi/>=2.2\|<3.0.dev0` | [Django supported versions](https://www.djangoproject.com/download/#supported-versions), [Django 2.2 release notes (2.2.28)](https://docs.djangoproject.com/en/2.2/releases/2.2.28/), [Django upgrade guide](https://docs.djangoproject.com/en/5.2/howto/upgrade-version/) |
| [Django 3.1 is end-of-life](../rules/python.package.django-3.1.eol.html) | End of life | 2021-12-07 | `vers:pypi/>=3.1\|<3.2.dev0` | [Django supported versions](https://www.djangoproject.com/download/#supported-versions), [Django 3.1 release notes (3.1.14)](https://docs.djangoproject.com/en/3.1/releases/3.1.14/), [Django upgrade guide](https://docs.djangoproject.com/en/5.2/howto/upgrade-version/) |
| [Django 3.0 is end-of-life](../rules/python.package.django-3.0.eol.html) | End of life | 2021-04-06 | `vers:pypi/>=3.0\|<3.1.dev0` | [Django supported versions](https://www.djangoproject.com/download/#supported-versions), [Django 3.0 release notes (3.0.14)](https://docs.djangoproject.com/en/3.0/releases/3.0.14/), [Django upgrade guide](https://docs.djangoproject.com/en/5.2/howto/upgrade-version/) |
| [Django 1.11 LTS is end-of-life](../rules/python.package.django-1.11.eol.html) | End of life | 2020-04-01 | `vers:pypi/>=1.11\|<2.0.dev0` | [Django supported versions](https://www.djangoproject.com/download/#supported-versions), [Django 1.11 release notes (1.11.29)](https://docs.djangoproject.com/en/1.11/releases/1.11.29/), [Django upgrade guide](https://docs.djangoproject.com/en/5.2/howto/upgrade-version/) |
| [Django 2.1 is end-of-life](../rules/python.package.django-2.1.eol.html) | End of life | 2019-12-02 | `vers:pypi/>=2.1\|<2.2.dev0` | [Django supported versions](https://www.djangoproject.com/download/#supported-versions), [Django 2.1 release notes (2.1.15)](https://docs.djangoproject.com/en/2.1/releases/2.1.15/), [Django upgrade guide](https://docs.djangoproject.com/en/5.2/howto/upgrade-version/) |
| [Django 2.0 is end-of-life](../rules/python.package.django-2.0.eol.html) | End of life | 2019-04-01 | `vers:pypi/>=2.0\|<2.1.dev0` | [Django supported versions](https://www.djangoproject.com/download/#supported-versions), [Django 2.0 release notes (2.0.13)](https://docs.djangoproject.com/en/2.0/releases/2.0.13/), [Django upgrade guide](https://docs.djangoproject.com/en/5.2/howto/upgrade-version/) |
| [Django 1.8 LTS is end-of-life](../rules/python.package.django-1.8.eol.html) | End of life | 2018-04-01 | `vers:pypi/>=1.8\|<1.9.dev0` | [Django supported versions](https://www.djangoproject.com/download/#supported-versions), [Django 1.8 release notes (1.8.19)](https://docs.djangoproject.com/en/1.8/releases/1.8.19/), [Django upgrade guide](https://docs.djangoproject.com/en/5.2/howto/upgrade-version/) |
| [Django 1.10 is end-of-life](../rules/python.package.django-1.10.eol.html) | End of life | 2017-12-02 | `vers:pypi/>=1.10\|<1.11.dev0` | [Django supported versions](https://www.djangoproject.com/download/#supported-versions), [Django 1.10 release notes (1.10.8)](https://docs.djangoproject.com/en/1.10/releases/1.10.8/), [Django upgrade guide](https://docs.djangoproject.com/en/5.2/howto/upgrade-version/) |
| [Django 1.9 is end-of-life](../rules/python.package.django-1.9.eol.html) | End of life | 2017-04-04 | `vers:pypi/>=1.9\|<1.10.dev0` | [Django supported versions](https://www.djangoproject.com/download/#supported-versions), [Django 1.9 release notes (1.9.13)](https://docs.djangoproject.com/en/1.9/releases/1.9.13/), [Django upgrade guide](https://docs.djangoproject.com/en/5.2/howto/upgrade-version/) |
| [Django 1.7 is end-of-life](../rules/python.package.django-1.7.eol.html) | End of life | 2015-12-01 | `vers:pypi/>=1.7\|<1.8.dev0` | [Django supported versions](https://www.djangoproject.com/download/#supported-versions), [Django upgrade guide](https://docs.djangoproject.com/en/5.2/howto/upgrade-version/) |
| [Django 1.4 LTS is end-of-life](../rules/python.package.django-1.4.eol.html) | End of life | 2015-10-01 | `vers:pypi/>=1.4\|<1.5.dev0` | [Django supported versions](https://www.djangoproject.com/download/#supported-versions), [Django upgrade guide](https://docs.djangoproject.com/en/5.2/howto/upgrade-version/) |
| [Django 1.6 is end-of-life](../rules/python.package.django-1.6.eol.html) | End of life | 2015-04-01 | `vers:pypi/>=1.6\|<1.7.dev0` | [Django supported versions](https://www.djangoproject.com/download/#supported-versions), [Django upgrade guide](https://docs.djangoproject.com/en/5.2/howto/upgrade-version/) |
| [Django 1.5 is end-of-life](../rules/python.package.django-1.5.eol.html) | End of life | 2014-09-02 | `vers:pypi/>=1.5\|<1.6.dev0` | [Django supported versions](https://www.djangoproject.com/download/#supported-versions), [Django upgrade guide](https://docs.djangoproject.com/en/5.2/howto/upgrade-version/) |
| [Django 1.3 is end-of-life](../rules/python.package.django-1.3.eol.html) | End of life | 2013-02-26 | `vers:pypi/>=1.3\|<1.4.dev0` | [Django supported versions](https://www.djangoproject.com/download/#supported-versions), [Django upgrade guide](https://docs.djangoproject.com/en/5.2/howto/upgrade-version/) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/django.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/django.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Django end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Some Django releases are end of life. Django 4.2 LTS is end-of-life as of 2026-04-07. This page lists 20 reviewed lifecycle rules for pkg:pypi/django, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check Django?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:pypi/django."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the Django dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
