---
title: "pycrypto has unfixed OSV advisories — dates, impact, migration"
description: "OSV lists GHSA-6528-wvf6-f6qg, GHSA-cq27-v7xp-c356, PYSEC-2018-97 against pycrypto with no fixed version in the affected ranges."
canonical_url: "https://arminazimi.github.io/evergreen/rules/osv.pypi.pycrypto.html"
---

# pycrypto has unfixed OSV advisories

OSV lists GHSA-6528-wvf6-f6qg, GHSA-cq27-v7xp-c356, PYSEC-2018-97 against pycrypto with no fixed version in the affected ranges.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | high |
| Ecosystem | `osv` |
| Component | `pkg:pypi/pycrypto` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Evidence last seen | 2026-10-27 |
| Reviewed | 2026-10-27 by arminazimi, drafted by the `osv` importer |
| Review due | 2027-10-27 (365 days after the last review) |
| Rule ID | `osv.pypi.pycrypto` |

## Sources

- [GHSA-6528-wvf6-f6qg](https://osv.dev/vulnerability/GHSA-6528-wvf6-f6qg)
- [GHSA-cq27-v7xp-c356](https://osv.dev/vulnerability/GHSA-cq27-v7xp-c356)
- [PYSEC-2018-97](https://osv.dev/vulnerability/PYSEC-2018-97)

## Detected by

No built-in detector reads `osv` declarations yet; the rule is data in the [lifecycle registry](https://github.com/arminazimi/evergreen/blob/main/registry/osv.json).

## Data

This page is generated from [`registry/osv.json`](https://github.com/arminazimi/evergreen/blob/main/registry/osv.json), rule `osv.pypi.pycrypto`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/osv.pypi.pycrypto.html",
  "url": "https://arminazimi.github.io/evergreen/rules/osv.pypi.pycrypto.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/osv.pypi.pycrypto.html",
  "headline": "pycrypto has unfixed OSV advisories — dates, impact, migration",
  "description": "OSV lists GHSA-6528-wvf6-f6qg, GHSA-cq27-v7xp-c356, PYSEC-2018-97 against pycrypto with no fixed version in the affected ranges.",
  "inLanguage": "en",
  "dateModified": "2026-10-27",
  "keywords": [
    "deprecated",
    "osv",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "pycrypto has unfixed OSV advisories",
    "identifier": "pkg:pypi/pycrypto"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "GHSA-6528-wvf6-f6qg",
      "url": "https://osv.dev/vulnerability/GHSA-6528-wvf6-f6qg"
    },
    {
      "@type": "CreativeWork",
      "name": "GHSA-cq27-v7xp-c356",
      "url": "https://osv.dev/vulnerability/GHSA-cq27-v7xp-c356"
    },
    {
      "@type": "CreativeWork",
      "name": "PYSEC-2018-97",
      "url": "https://osv.dev/vulnerability/PYSEC-2018-97"
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
