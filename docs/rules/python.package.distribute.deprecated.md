---
title: "distribute is deprecated — dates, impact, migration"
description: "The project describes Distribute as a deprecated Setuptools fork whose code was merged back into Setuptools."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.package.distribute.deprecated.html"
json_twin: "/rules/python.package.distribute.deprecated.json"
---

# distribute is deprecated

**Deprecated.** The source gives no day. Replacement: setuptools. Source: [Distribute deprecation notice](https://pypi.org/project/distribute/).

Check a version:

```bash
evergreen check pkg:pypi/distribute
```

The project describes Distribute as a deprecated Setuptools fork whose code was merged back into Setuptools.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | high |
| Ecosystem | `python` |
| Component | `pkg:pypi/distribute` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | setuptools |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.distribute.deprecated` |

## Sources

- [Distribute deprecation notice](https://pypi.org/project/distribute/)

## Migration

**Constraints**

- Preserve build backend behavior, package metadata, entry points, and supported installer environments.

**Steps**

1. **Replace Distribute.** Replace distribute requirements and bootstrap scripts with setuptools and remove distribute-specific installation logic.
2. **Verify package builds.** Build source and wheel distributions in a clean environment and inspect their metadata and entry points.

**Verification**

- `python -m pip check`: Check the packaging environment after replacement.
- `python -m pytest`: Run packaging and repository tests.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.distribute.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/python.package.distribute.deprecated.html",
      "url": "https://arminazimi.github.io/evergreen/rules/python.package.distribute.deprecated.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.distribute.deprecated.html",
      "headline": "distribute is deprecated — dates, impact, migration",
      "description": "The project describes Distribute as a deprecated Setuptools fork whose code was merged back into Setuptools.",
      "inLanguage": "en",
      "dateModified": "2026-10-16",
      "keywords": [
        "deprecated",
        "python",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "distribute is deprecated",
        "identifier": "pkg:pypi/distribute"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Distribute deprecation notice",
          "url": "https://pypi.org/project/distribute/"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/python.package.distribute.deprecated.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/python.package.distribute.deprecated.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:pypi/distribute?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated. The source gives no day. Affected versions: vers:pypi/*. Source: Distribute deprecation notice (https://pypi.org/project/distribute/)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:pypi/distribute?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "setuptools"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:pypi/distribute?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:pypi/distribute."
          }
        }
      ]
    }
  ]
}
</script>
