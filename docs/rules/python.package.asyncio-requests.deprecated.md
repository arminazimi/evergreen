---
title: "asyncio-requests is retired — dates, impact, migration"
description: "The maintainer states that asyncio-requests is retired and that development continues under the asyncio-gateway name."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.package.asyncio-requests.deprecated.html"
---

# asyncio-requests is retired

**Deprecated.** The source gives no day. Replacement: asyncio-gateway. Source: [asyncio-gateway migration notice](https://pypi.org/project/asyncio-gateway/).

Check a version:

```bash
evergreen check pkg:pypi/asyncio-requests
```

The maintainer states that asyncio-requests is retired and that development continues under the asyncio-gateway name.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | high |
| Ecosystem | `python` |
| Component | `pkg:pypi/asyncio-requests` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | asyncio-gateway |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.asyncio-requests.deprecated` |

## Sources

- [asyncio-gateway migration notice](https://pypi.org/project/asyncio-gateway/)

## Migration

**Constraints**

- Preserve HTTP, SOAP, FTP, and SFTP behavior, TLS verification, retries, processors, response envelopes, and error handling.

**Steps**

1. **Replace asyncio-requests.** Replace the distribution and asyncio_requests imports with asyncio-gateway interfaces, then review the documented breaking and security changes.

**Verification**

- `python -m pytest`: Run protocol, TLS, response, and repository tests.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.asyncio-requests.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.package.asyncio-requests.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.package.asyncio-requests.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.asyncio-requests.deprecated.html",
  "headline": "asyncio-requests is retired — dates, impact, migration",
  "description": "The maintainer states that asyncio-requests is retired and that development continues under the asyncio-gateway name.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "deprecated",
    "python",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "asyncio-requests is retired",
    "identifier": "pkg:pypi/asyncio-requests"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "asyncio-gateway migration notice",
      "url": "https://pypi.org/project/asyncio-gateway/"
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
