---
title: "CentOS Linux 8 and older are end-of-life — dates, impact, migration"
description: "CentOS Linux 8 reached end of life on 2021-12-31 and CentOS Linux 7 on 2024-06-30, so neither receives fixes. CentOS Stream 9 and 10 follow a different lifecycle and are not covered by this rule."
layout: doc
permalink: "/rules/container.host-centos.eol-8-and-older.html"
canonical_url: "https://arminazimi.github.io/evergreen/rules/container.host-centos.eol-8-and-older.html"
image: "/assets/og/container.host-centos.eol-8-and-older.svg"
review_date: "2026-10-30"
last_modified_at: "2026-10-30"
json_twin: "/rules/container.host-centos.eol-8-and-older.json"
---

# CentOS Linux 8 and older are end-of-life

**End of life** as of 2024-06-30. Replacement: CentOS Stream 9 or 10, or a distribution with a published lifecycle. Source: [CentOS Linux](https://www.centos.org/centos-linux/).

Check a version:

```bash
evergreen check pkg:generic/centos
```

CentOS Linux 8 reached end of life on 2021-12-31 and CentOS Linux 7 on 2024-06-30, so neither receives fixes. CentOS Stream 9 and 10 follow a different lifecycle and are not covered by this rule.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `container` |
| Component | `pkg:generic/centos` |
| Affected versions | `vers:semver/<9.0.0` |
| Date from the source | 2024-06-30 |
| Replacement | CentOS Stream 9 or 10, or a distribution with a published lifecycle |
| Evidence last seen | 2026-10-30 |
| Reviewed | 2026-10-30 by arminazimi, drafted by the `endoflife-date` importer |
| Review due | 2027-10-30 (365 days after the last review) |
| Rule ID | `container.host-centos.eol-8-and-older` |

## Sources

- [CentOS Linux](https://www.centos.org/centos-linux/) (accessed 2026-10-30)

## Migration

**Constraints**

- CentOS Linux has no upgrade path to CentOS Stream; plan a rebuild or a migration to another distribution.
- Confirm application packages and repositories exist for the target platform before rebuilding.

**Steps**

1. **Replace the CentOS host.** Rebuild the host on CentOS Stream or a distribution with a published lifecycle, then redeploy the workload.

**Verification**

- `cat /etc/centos-release`: Confirm the host reports the target CentOS release.
- `dnf check-update`: Check that package updates resolve on the target release.

## Detected by

The [`container`](../detectors/container.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Same ecosystem

- [Alpine Linux image release lines 3.20 and older are end-of-life](container.alpine.eol-3.20-and-older.html)
- [Alpine Linux image release line 3.21 is end-of-life](container.alpine.eol-3.21.html)
- [Caddy image release lines 1 and older are end-of-life](container.caddy.eol-1-and-older.html)
- [ClickHouse image release lines 26.2 and older are end-of-life](container.clickhouse.eol-26.2-and-older.html)
- [Couchbase Server image release lines 7.2 and older are end-of-life](container.couchbase.eol-7.2-and-older.html)
- [Apache CouchDB image release lines 3.3 and older are end-of-life](container.couchdb.eol-3.3-and-older.html)
- [Debian image release lines 11 and older are end-of-life](container.debian.eol-11-and-older.html)
- [The Dockerfile legacy "ENV key value" form is deprecated](container.dockerfile.legacy-env-format.html)


## Data

This page is generated from [`registry/container.json`](https://github.com/arminazimi/evergreen/blob/main/registry/container.json), rule `container.host-centos.eol-8-and-older`, in the `ebb.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/container.host-centos.eol-8-and-older.html",
      "url": "https://arminazimi.github.io/evergreen/rules/container.host-centos.eol-8-and-older.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/container.host-centos.eol-8-and-older.html",
      "headline": "CentOS Linux 8 and older are end-of-life — dates, impact, migration",
      "description": "CentOS Linux 8 reached end of life on 2021-12-31 and CentOS Linux 7 on 2024-06-30, so neither receives fixes. CentOS Stream 9 and 10 follow a different lifecycle and are not covered by this rule.",
      "inLanguage": "en",
      "dateModified": "2026-10-30",
      "keywords": [
        "end-of-life",
        "container",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "CentOS Linux 8 and older are end-of-life",
        "identifier": "pkg:generic/centos"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "CentOS Linux",
          "url": "https://www.centos.org/centos-linux/"
        }
      ],
      "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/container.json",
      "publisher": {
        "@type": "Organization",
        "name": "Evergreen",
        "url": "https://arminazimi.github.io/evergreen"
      }
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/container.host-centos.eol-8-and-older.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/container.host-centos.eol-8-and-older.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/centos?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life as of 2024-06-30. Affected versions: vers:semver/\u003c9.0.0. Source: CentOS Linux (https://www.centos.org/centos-linux/)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/centos?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "CentOS Stream 9 or 10, or a distribution with a published lifecycle"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/centos?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/centos."
          }
        }
      ]
    }
  ]
}
</script>
