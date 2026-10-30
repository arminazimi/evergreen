---
title: "pep8 was renamed to pycodestyle — dates, impact, migration"
description: "The maintainers renamed the pep8 project to pycodestyle to reduce confusion."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.package.pep8.deprecated.html"
json_twin: "/rules/python.package.pep8.deprecated.json"
---

# pep8 was renamed to pycodestyle

**Deprecated.** The source gives no day. Replacement: pycodestyle. Source: [pycodestyle rename notice](https://pypi.org/project/pycodestyle/).

Check a version:

```bash
evergreen check pkg:pypi/pep8
```

The maintainers renamed the pep8 project to pycodestyle to reduce confusion.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `python` |
| Component | `pkg:pypi/pep8` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | pycodestyle |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.pep8.deprecated` |

## Sources

- [pycodestyle rename notice](https://pypi.org/project/pycodestyle/)

## Migration

**Constraints**

- Preserve selected checks, ignore lists, file exclusions, maximum line length, and CI failure behavior.

**Steps**

1. **Replace pep8 with pycodestyle.** Replace the dependency, commands, imports, and configuration section name with pycodestyle equivalents.
2. **Compare style results.** Run both configurations on the same source tree and review any changed diagnostics before removing pep8.

**Verification**

- `python -m pycodestyle .`: Run the replacement style checker with project configuration.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Same ecosystem

- [agentops-toolkit was renamed and is no longer maintained](python.package.agentops-toolkit.eol.html)
- [aiohttp-valera-validator was renamed and is no longer maintained](python.package.aiohttp-valera-validator.eol.html)
- [api-shield is deprecated](python.package.api-shield.deprecated.html)
- [apisec-code-bolt was renamed](python.package.apisec-code-bolt.deprecated.html)
- [argparse is archived on PyPI](python.package.argparse.archived.html)
- [asyncio-requests is retired](python.package.asyncio-requests.deprecated.html)
- [BatchNotebook is deprecated](python.package.batchnotebook.deprecated.html)
- [cmip_ref was renamed and is no longer maintained](python.package.cmip-ref.eol.html)


## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.pep8.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/python.package.pep8.deprecated.html",
      "url": "https://arminazimi.github.io/evergreen/rules/python.package.pep8.deprecated.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.pep8.deprecated.html",
      "headline": "pep8 was renamed to pycodestyle — dates, impact, migration",
      "description": "The maintainers renamed the pep8 project to pycodestyle to reduce confusion.",
      "inLanguage": "en",
      "dateModified": "2026-10-16",
      "keywords": [
        "deprecated",
        "python",
        "medium"
      ],
      "about": {
        "@type": "Thing",
        "name": "pep8 was renamed to pycodestyle",
        "identifier": "pkg:pypi/pep8"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "pycodestyle rename notice",
          "url": "https://pypi.org/project/pycodestyle/"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/python.package.pep8.deprecated.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/python.package.pep8.deprecated.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:pypi/pep8?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated. The source gives no day. Affected versions: vers:pypi/*. Source: pycodestyle rename notice (https://pypi.org/project/pycodestyle/)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:pypi/pep8?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "pycodestyle"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:pypi/pep8?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:pypi/pep8."
          }
        }
      ]
    }
  ]
}
</script>
