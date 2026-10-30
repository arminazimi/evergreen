---
title: "pyinj is archived on PyPI — dates, impact, migration"
description: "PyPI marks pyinj as archived, and the maintainers state that the repository is no longer maintained."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.package.pyinj.archived.html"
image: "/assets/og/python.package.pyinj.archived.svg"
json_twin: "/rules/python.package.pyinj.archived.json"
---

# pyinj is archived on PyPI

**End of life.** The source gives no day. Replacement: injx. Source: [pyinj archival and migration notice](https://pypi.org/project/pyinj/).

Check a version:

```bash
evergreen check pkg:pypi/pyinj
```

PyPI marks pyinj as archived, and the maintainers state that the repository is no longer maintained.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | medium |
| Ecosystem | `python` |
| Component | `pkg:pypi/pyinj` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | injx |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.pyinj.archived` |

## Sources

- [pyinj archival and migration notice](https://pypi.org/project/pyinj/)
- [pyinj project status (PyPI Simple API)](https://pypi.org/simple/pyinj/)
- [Project status markers (PEP 792)](https://packaging.python.org/specifications/project-status-markers/)

## Migration

**Constraints**

- Preserve provider scopes, binding resolution, constructor injection, overrides, and application startup behavior.

**Steps**

1. **Replace pyinj with injx.** Replace the distribution and imports, then translate bindings and injection declarations to the injx API.
2. **Verify the injection graph.** Exercise application startup, nested dependencies, scopes, overrides, and missing-binding errors.

**Verification**

- `python -m pytest`: Run dependency-injection and repository tests.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.pyinj.archived`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/python.package.pyinj.archived.html",
      "url": "https://arminazimi.github.io/evergreen/rules/python.package.pyinj.archived.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.pyinj.archived.html",
      "headline": "pyinj is archived on PyPI — dates, impact, migration",
      "description": "PyPI marks pyinj as archived, and the maintainers state that the repository is no longer maintained.",
      "inLanguage": "en",
      "dateModified": "2026-10-16",
      "keywords": [
        "end-of-life",
        "python",
        "medium"
      ],
      "about": {
        "@type": "Thing",
        "name": "pyinj is archived on PyPI",
        "identifier": "pkg:pypi/pyinj"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "pyinj archival and migration notice",
          "url": "https://pypi.org/project/pyinj/"
        },
        {
          "@type": "CreativeWork",
          "name": "pyinj project status (PyPI Simple API)",
          "url": "https://pypi.org/simple/pyinj/"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/python.package.pyinj.archived.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/python.package.pyinj.archived.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:pypi/pyinj?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life. The source gives no day. Affected versions: vers:pypi/*. Source: pyinj archival and migration notice (https://pypi.org/project/pyinj/)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:pypi/pyinj?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "injx"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:pypi/pyinj?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:pypi/pyinj."
          }
        }
      ]
    }
  ]
}
</script>
