---
title: "aiohttp-valera-validator was renamed and is no longer maintained"
description: "The maintainer states that aiohttp-valera-validator is no longer maintained and was renamed to aiohttp-d42-validator."
---

# aiohttp-valera-validator was renamed and is no longer maintained

The maintainer states that aiohttp-valera-validator is no longer maintained and was renamed to aiohttp-d42-validator.

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `python` |
| Component | `pkg:pypi/aiohttp-valera-validator` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | aiohttp-d42-validator |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.aiohttp-valera-validator.eol` |

## Sources

- [aiohttp-valera-validator rename notice](https://pypi.org/project/aiohttp-valera-validator/)

## Migration

**Constraints**

- Preserve request parameter, query, body, and response validation; schema semantics; aiohttp middleware behavior; and error responses.

**Steps**

1. **Move to aiohttp-d42-validator.** Replace the distribution, update imports to aiohttp_d42_validator, and translate schemas and decorators to the renamed package.

**Verification**

- `python -m pytest`: Run valid and invalid request, schema, response, middleware, and project tests when defined.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.aiohttp-valera-validator.eol`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.package.aiohttp-valera-validator.eol.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.package.aiohttp-valera-validator.eol.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.aiohttp-valera-validator.eol.html",
  "headline": "aiohttp-valera-validator was renamed and is no longer maintained",
  "description": "The maintainer states that aiohttp-valera-validator is no longer maintained and was renamed to aiohttp-d42-validator.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "end-of-life",
    "python",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "aiohttp-valera-validator was renamed and is no longer maintained",
    "identifier": "pkg:pypi/aiohttp-valera-validator"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "aiohttp-valera-validator rename notice",
      "url": "https://pypi.org/project/aiohttp-valera-validator/"
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
