---
title: "api-shield is deprecated — dates, impact, migration"
description: "The maintainer renamed api-shield to waygate and states that no further releases will be published under the old name."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.package.api-shield.deprecated.html"
---

# api-shield is deprecated

The maintainer renamed api-shield to waygate and states that no further releases will be published under the old name.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `python` |
| Component | `pkg:pypi/api-shield` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | waygate |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.api-shield.deprecated` |

## Sources

- [api-shield deprecation notice](https://pypi.org/project/api-shield/)

## Migration

**Constraints**

- Preserve feature flags, rollout state, rate limits, maintenance windows, storage, and framework adapters.

**Steps**

1. **Replace api-shield.** Replace the distribution, change shield imports and commands to waygate, and migrate configuration using the maintained documentation.

**Verification**

- `python -m pytest`: Run policy, rollout, rate-limit, and repository tests.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.api-shield.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.package.api-shield.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.package.api-shield.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.api-shield.deprecated.html",
  "headline": "api-shield is deprecated — dates, impact, migration",
  "description": "The maintainer renamed api-shield to waygate and states that no further releases will be published under the old name.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "deprecated",
    "python",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "api-shield is deprecated",
    "identifier": "pkg:pypi/api-shield"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "api-shield deprecation notice",
      "url": "https://pypi.org/project/api-shield/"
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
