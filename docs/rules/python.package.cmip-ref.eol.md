---
title: "cmip_ref was renamed and is no longer maintained — dates, impact, migration"
description: "The maintainers state that cmip_ref is deprecated, no longer maintained, and renamed to climate-ref."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.package.cmip-ref.eol.html"
---

# cmip_ref was renamed and is no longer maintained

The maintainers state that cmip_ref is deprecated, no longer maintained, and renamed to climate-ref.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `python` |
| Component | `pkg:pypi/cmip-ref` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | climate-ref |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.cmip-ref.eol` |

## Sources

- [cmip_ref rename and maintenance notice](https://pypi.org/project/cmip-ref/)

## Migration

**Constraints**

- Preserve configuration, climate data inputs, diagnostics, output formats, provenance, and command behavior.

**Steps**

1. **Move to climate-ref.** Replace cmip_ref with climate-ref, update imports from cmip_ref to climate_ref, and translate any changed configuration or commands.

**Verification**

- `python -m pytest`: Run climate data, diagnostics, output, command, and project tests when defined.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.cmip-ref.eol`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.package.cmip-ref.eol.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.package.cmip-ref.eol.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.cmip-ref.eol.html",
  "headline": "cmip_ref was renamed and is no longer maintained — dates, impact, migration",
  "description": "The maintainers state that cmip_ref is deprecated, no longer maintained, and renamed to climate-ref.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "end-of-life",
    "python",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "cmip_ref was renamed and is no longer maintained",
    "identifier": "pkg:pypi/cmip-ref"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "cmip_ref rename and maintenance notice",
      "url": "https://pypi.org/project/cmip-ref/"
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
