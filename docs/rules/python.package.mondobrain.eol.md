---
title: "mondobrain is no longer maintained — dates, impact, migration"
description: "The maintainer yanked mondobrain releases because the project is no longer maintained and recommends datawhys."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.package.mondobrain.eol.html"
---

# mondobrain is no longer maintained

**End of life.** The source gives no day. Replacement: datawhys. Source: [mondobrain maintenance and replacement notice](https://pypi.org/project/mondobrain/).

Check a version:

```bash
evergreen check pkg:pypi/mondobrain
```

The maintainer yanked mondobrain releases because the project is no longer maintained and recommends datawhys.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `python` |
| Component | `pkg:pypi/mondobrain` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | datawhys |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.mondobrain.eol` |

## Sources

- [mondobrain maintenance and replacement notice](https://pypi.org/project/mondobrain/)

## Migration

**Constraints**

- Preserve data loading, analysis workflows, notebook integration, model behavior, and serialized artifacts relied on by users.

**Steps**

1. **Move to datawhys.** Replace the distribution and translate mondobrain imports and workflows to datawhys equivalents.

**Verification**

- `python -m pytest`: Run affected data workflow and project tests when defined.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.mondobrain.eol`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.package.mondobrain.eol.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.package.mondobrain.eol.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.mondobrain.eol.html",
  "headline": "mondobrain is no longer maintained — dates, impact, migration",
  "description": "The maintainer yanked mondobrain releases because the project is no longer maintained and recommends datawhys.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "end-of-life",
    "python",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "mondobrain is no longer maintained",
    "identifier": "pkg:pypi/mondobrain"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "mondobrain maintenance and replacement notice",
      "url": "https://pypi.org/project/mondobrain/"
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
