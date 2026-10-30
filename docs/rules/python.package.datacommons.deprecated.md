---
title: "datacommons is deprecated — dates, impact, migration"
description: "The maintainers state that datacommons is no longer maintained or functional and direct users to datacommons-client."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.package.datacommons.deprecated.html"
json_twin: "/rules/python.package.datacommons.deprecated.json"
---

# datacommons is deprecated

The maintainers state that datacommons is no longer maintained or functional and direct users to datacommons-client.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | high |
| Ecosystem | `python` |
| Component | `pkg:pypi/datacommons` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | datacommons-client |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.datacommons.deprecated` |

## Sources

- [datacommons deprecation notice](https://pypi.org/project/datacommons/)

## Migration

**Constraints**

- Preserve API endpoints, authentication, statistical-variable identifiers, entity queries, response shapes, pagination, and retry behavior.

**Steps**

1. **Replace the Data Commons client.** Replace datacommons with datacommons-client and translate client construction and API calls using the official migration guide.
2. **Verify query results.** Compare representative entity, observation, and graph query responses and error paths against expected fixtures.

**Verification**

- `python -m pytest`: Run Data Commons integration and repository tests.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.datacommons.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.package.datacommons.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.package.datacommons.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.datacommons.deprecated.html",
  "headline": "datacommons is deprecated — dates, impact, migration",
  "description": "The maintainers state that datacommons is no longer maintained or functional and direct users to datacommons-client.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "deprecated",
    "python",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "datacommons is deprecated",
    "identifier": "pkg:pypi/datacommons"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "datacommons deprecation notice",
      "url": "https://pypi.org/project/datacommons/"
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
