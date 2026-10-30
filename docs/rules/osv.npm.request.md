---
title: "request has unfixed OSV advisories — dates, impact, migration"
description: "OSV lists GHSA-p8p7-x288-28g6 against request with no fixed version in the affected ranges."
canonical_url: "https://arminazimi.github.io/evergreen/rules/osv.npm.request.html"
json_twin: "/rules/osv.npm.request.json"
---

# request has unfixed OSV advisories

**Deprecated.** The source gives no day. Source: [GHSA-p8p7-x288-28g6](https://osv.dev/vulnerability/GHSA-p8p7-x288-28g6).

Check a version:

```bash
evergreen check pkg:npm/request
```

OSV lists GHSA-p8p7-x288-28g6 against request with no fixed version in the affected ranges.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | high |
| Ecosystem | `osv` |
| Component | `pkg:npm/request` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Evidence last seen | 2026-10-27 |
| Reviewed | 2026-10-27 by arminazimi, drafted by the `osv` importer |
| Review due | 2027-10-27 (365 days after the last review) |
| Rule ID | `osv.npm.request` |

## Sources

- [GHSA-p8p7-x288-28g6](https://osv.dev/vulnerability/GHSA-p8p7-x288-28g6)

## Detected by

No built-in detector reads `osv` declarations yet; the rule is data in the [lifecycle registry](https://github.com/arminazimi/evergreen/blob/main/registry/osv.json).

## Data

This page is generated from [`registry/osv.json`](https://github.com/arminazimi/evergreen/blob/main/registry/osv.json), rule `osv.npm.request`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/osv.npm.request.html",
  "url": "https://arminazimi.github.io/evergreen/rules/osv.npm.request.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/osv.npm.request.html",
  "headline": "request has unfixed OSV advisories — dates, impact, migration",
  "description": "OSV lists GHSA-p8p7-x288-28g6 against request with no fixed version in the affected ranges.",
  "inLanguage": "en",
  "dateModified": "2026-10-27",
  "keywords": [
    "deprecated",
    "osv",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "request has unfixed OSV advisories",
    "identifier": "pkg:npm/request"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "GHSA-p8p7-x288-28g6",
      "url": "https://osv.dev/vulnerability/GHSA-p8p7-x288-28g6"
    }
  ],
  "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/osv.json",
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen"
  }
}
</script>
