---
title: "saroku was renamed to trikesh — dates, impact, migration"
description: "The maintainer states that saroku was renamed and is no longer maintained under that name."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.package.saroku.deprecated.html"
---

# saroku was renamed to trikesh

The maintainer states that saroku was renamed and is no longer maintained under that name.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `python` |
| Component | `pkg:pypi/saroku` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | trikesh |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.saroku.deprecated` |

## Sources

- [saroku rename notice](https://pypi.org/project/saroku/)

## Migration

**Constraints**

- Preserve command behavior, configuration, output formats, and any persisted state.

**Steps**

1. **Replace saroku.** Replace the distribution and translate saroku imports and commands to trikesh equivalents.

**Verification**

- `python -m pytest`: Run affected command and repository tests.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.saroku.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.package.saroku.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.package.saroku.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.saroku.deprecated.html",
  "headline": "saroku was renamed to trikesh — dates, impact, migration",
  "description": "The maintainer states that saroku was renamed and is no longer maintained under that name.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "deprecated",
    "python",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "saroku was renamed to trikesh",
    "identifier": "pkg:pypi/saroku"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "saroku rename notice",
      "url": "https://pypi.org/project/saroku/"
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
