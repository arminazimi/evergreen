---
title: "SUSE Linux Enterprise Server 15 SP6 and older are past general support — dates, impact, migration"
description: "General support ended for SLES 15 SP6 on 2025-12-31, SP5 on 2024-12-31, and SP4 on 2023-12-31, and for SP3 and older earlier."
layout: doc
permalink: "/rules/container.host-sles.eol-15-sp6-and-older.html"
canonical_url: "https://arminazimi.github.io/evergreen/rules/container.host-sles.eol-15-sp6-and-older.html"
image: "/assets/og/container.host-sles.eol-15-sp6-and-older.svg"
review_date: "2026-10-30"
last_modified_at: "2026-10-30"
json_twin: "/rules/container.host-sles.eol-15-sp6-and-older.json"
---

# SUSE Linux Enterprise Server 15 SP6 and older are past general support

**End of life** as of 2025-12-31. Replacement: SLES 15 SP7 or SLES 16. Source: [SUSE product support lifecycle](https://www.suse.com/lifecycle/).

Check a version:

```bash
evergreen check pkg:generic/sles
```

General support ended for SLES 15 SP6 on 2025-12-31, SP5 on 2024-12-31, and SP4 on 2023-12-31, and for SP3 and older earlier. Long Term Service Pack Support is a separate paid add-on; SLES 15 SP7 and SLES 16 remain in general support.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `container` |
| Component | `pkg:generic/sles` |
| Affected versions | `vers:semver/<15.7.0` |
| Date from the source | 2025-12-31 |
| Replacement | SLES 15 SP7 or SLES 16 |
| Evidence last seen | 2026-10-30 |
| Reviewed | 2026-10-30 by arminazimi, drafted by the `endoflife-date` importer |
| Review due | 2027-10-30 (365 days after the last review) |
| Rule ID | `container.host-sles.eol-15-sp6-and-older` |

## Sources

- [SUSE product support lifecycle](https://www.suse.com/lifecycle/) (accessed 2026-10-30)
- [SLES 15 SP6 lifecycle and support](https://documentation.suse.com/sles/15-SP6/html/SLES-all/cha-upgrade-background.html) (accessed 2026-10-30)

## Migration

**Constraints**

- Use the supported service-pack migration path, or rebuild the host on the target service pack.
- Long Term Service Pack Support is a separate paid add-on; do not count it as general support.

**Steps**

1. **Upgrade the SLES host.** Move the host to a supported SLES service pack, confirm subscriptions and third-party packages, then return it to service.

**Verification**

- `cat /etc/os-release`: Confirm the host reports the target SLES service pack.
- `zypper refresh`: Check that the target repositories are configured and reachable.

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

This page is generated from [`registry/container.json`](https://github.com/arminazimi/evergreen/blob/main/registry/container.json), rule `container.host-sles.eol-15-sp6-and-older`, in the `ebb.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/container.host-sles.eol-15-sp6-and-older.html",
      "url": "https://arminazimi.github.io/evergreen/rules/container.host-sles.eol-15-sp6-and-older.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/container.host-sles.eol-15-sp6-and-older.html",
      "headline": "SUSE Linux Enterprise Server 15 SP6 and older are past general support — dates, impact, migration",
      "description": "General support ended for SLES 15 SP6 on 2025-12-31, SP5 on 2024-12-31, and SP4 on 2023-12-31, and for SP3 and older earlier.",
      "inLanguage": "en",
      "dateModified": "2026-10-30",
      "keywords": [
        "end-of-life",
        "container",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "SUSE Linux Enterprise Server 15 SP6 and older are past general support",
        "identifier": "pkg:generic/sles"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "SUSE product support lifecycle",
          "url": "https://www.suse.com/lifecycle/"
        },
        {
          "@type": "CreativeWork",
          "name": "SLES 15 SP6 lifecycle and support",
          "url": "https://documentation.suse.com/sles/15-SP6/html/SLES-all/cha-upgrade-background.html"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/container.host-sles.eol-15-sp6-and-older.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/container.host-sles.eol-15-sp6-and-older.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/sles?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life as of 2025-12-31. Affected versions: vers:semver/\u003c15.7.0. Source: SUSE product support lifecycle (https://www.suse.com/lifecycle/)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/sles?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "SLES 15 SP7 or SLES 16"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/sles?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/sles."
          }
        }
      ]
    }
  ]
}
</script>
