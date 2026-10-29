---
title: "apisec-code-bolt was renamed — dates, impact, migration"
description: "The maintainer states that apisec-code-bolt was renamed to apisec-surface and receives no further releases under the old name."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.package.apisec-code-bolt.deprecated.html"
---

# apisec-code-bolt was renamed

The maintainer states that apisec-code-bolt was renamed to apisec-surface and receives no further releases under the old name.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `python` |
| Component | `pkg:pypi/apisec-code-bolt` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | apisec-surface |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.apisec-code-bolt.deprecated` |

## Sources

- [apisec-surface rename notice](https://pypi.org/project/apisec-surface/)

## Migration

**Constraints**

- Preserve authentication, configuration, saved credentials, scan scope, manifest output, upload behavior, and CI exit codes.

**Steps**

1. **Replace apisec-code-bolt.** Replace the distribution with apisec-surface and verify the renamed command, while retaining compatible state and configuration documented by the maintainer.

**Verification**

- `python -m pytest`: Run APIsec CLI integration and repository tests when defined.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.apisec-code-bolt.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.package.apisec-code-bolt.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.package.apisec-code-bolt.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.apisec-code-bolt.deprecated.html",
  "headline": "apisec-code-bolt was renamed — dates, impact, migration",
  "description": "The maintainer states that apisec-code-bolt was renamed to apisec-surface and receives no further releases under the old name.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "deprecated",
    "python",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "apisec-code-bolt was renamed",
    "identifier": "pkg:pypi/apisec-code-bolt"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "apisec-surface rename notice",
      "url": "https://pypi.org/project/apisec-surface/"
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
