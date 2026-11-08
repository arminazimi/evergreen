---
title: "typing is archived on PyPI — dates, impact, migration"
description: "PyPI marks typing as archived: the project does not expect to be updated in the future."
layout: doc
permalink: "/rules/python.package.typing.archived.html"
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.package.typing.archived.html"
image: "/assets/og/python.package.typing.archived.svg"
review_date: "2026-10-20"
last_modified_at: "2026-10-20"
json_twin: "/rules/python.package.typing.archived.json"
---

# typing is archived on PyPI

**End of life.** The source gives no day. Source: [typing on PyPI](https://pypi.org/project/typing/).

Check a version:

```bash
evergreen check pkg:pypi/typing
```

PyPI marks typing as archived: the project does not expect to be updated in the future.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | medium |
| Ecosystem | `python` |
| Component | `pkg:pypi/typing` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Evidence last seen | 2026-10-20 |
| Reviewed | 2026-10-20 by arminazimi |
| Review due | 2027-10-20 (365 days after the last review) |
| Rule ID | `python.package.typing.archived` |

## Sources

- [typing on PyPI](https://pypi.org/project/typing/) (accessed 2026-10-20)
- [typing project status (PyPI Simple API)](https://pypi.org/simple/typing/) (accessed 2026-10-20)
- [Project status markers (PEP 792)](https://packaging.python.org/specifications/project-status-markers/) (accessed 2026-10-20)

## Migration

**Constraints**

- Preserve behavior while removing typing; PyPI says the project does not expect to be updated, so it will not receive fixes or support for newer Python releases.

**Steps**

1. **Replace typing.** Remove typing from requirements, pyproject.toml, and lock files and replace it with a maintained alternative (often the standard library or the project that superseded it), then update the imports.

**Verification**

- `python -m pip check`: Confirm the installed distributions have no broken requirements.
- `python -m pytest`: Run the test suite without the archived distribution.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Same ecosystem

- [The aifc module was removed in Python 3.13](python.module.aifc.removed.html)
- [The asynchat module was removed in Python 3.12](python.module.asynchat.removed.html)
- [The asyncore module was removed in Python 3.12](python.module.asyncore.removed.html)
- [The audioop module was removed in Python 3.13](python.module.audioop.removed.html)
- [The cgi module was removed in Python 3.13](python.module.cgi.removed.html)
- [The cgitb module was removed in Python 3.13](python.module.cgitb.removed.html)
- [The chunk module was removed in Python 3.13](python.module.chunk.removed.html)
- [The crypt module was removed in Python 3.13](python.module.crypt.removed.html)


## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.typing.archived`, in the `ebb.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/python.package.typing.archived.html",
      "url": "https://arminazimi.github.io/evergreen/rules/python.package.typing.archived.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.typing.archived.html",
      "headline": "typing is archived on PyPI — dates, impact, migration",
      "description": "PyPI marks typing as archived: the project does not expect to be updated in the future.",
      "inLanguage": "en",
      "dateModified": "2026-10-20",
      "keywords": [
        "end-of-life",
        "python",
        "medium"
      ],
      "about": {
        "@type": "Thing",
        "name": "typing is archived on PyPI",
        "identifier": "pkg:pypi/typing"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "typing on PyPI",
          "url": "https://pypi.org/project/typing/"
        },
        {
          "@type": "CreativeWork",
          "name": "typing project status (PyPI Simple API)",
          "url": "https://pypi.org/simple/typing/"
        },
        {
          "@type": "CreativeWork",
          "name": "Project status markers (PEP 792)",
          "url": "https://packaging.python.org/specifications/project-status-markers/"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/python.package.typing.archived.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/python.package.typing.archived.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:pypi/typing?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life. The source gives no day. Affected versions: vers:pypi/*. Source: typing on PyPI (https://pypi.org/project/typing/)."
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:pypi/typing?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:pypi/typing."
          }
        }
      ]
    }
  ]
}
</script>
