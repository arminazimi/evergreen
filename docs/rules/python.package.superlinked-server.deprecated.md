---
title: "superlinked-server is deprecated — dates, impact, migration"
description: "The maintainer identifies superlinked-server as a legacy package deprecated for new projects and directs users to SIE Server and sie-sdk."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.package.superlinked-server.deprecated.html"
---

# superlinked-server is deprecated

The maintainer identifies superlinked-server as a legacy package deprecated for new projects and directs users to SIE Server and sie-sdk.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `python` |
| Component | `pkg:pypi/superlinked-server` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | SIE Server and sie-sdk |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.superlinked-server.deprecated` |

## Sources

- [superlinked-server deprecation notice](https://pypi.org/project/superlinked-server/)

## Migration

**Constraints**

- Preserve model selection, indexing, query behavior, deployment settings, authentication, and response contracts.

**Steps**

1. **Adopt SIE.** Deploy SIE Server, replace the legacy package with sie-sdk, and translate server and client configuration to the current interfaces.

**Verification**

- `python -m pytest`: Run inference, indexing, query, and repository tests.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.superlinked-server.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.package.superlinked-server.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.package.superlinked-server.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.superlinked-server.deprecated.html",
  "headline": "superlinked-server is deprecated — dates, impact, migration",
  "description": "The maintainer identifies superlinked-server as a legacy package deprecated for new projects and directs users to SIE Server and sie-sdk.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "deprecated",
    "python",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "superlinked-server is deprecated",
    "identifier": "pkg:pypi/superlinked-server"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "superlinked-server deprecation notice",
      "url": "https://pypi.org/project/superlinked-server/"
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
