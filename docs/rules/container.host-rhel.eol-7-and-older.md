---
title: "Red Hat Enterprise Linux 7 and older are past maintenance support — dates, impact, migration"
description: "RHEL 7 reached the end of its maintenance support phase on 2024-06-30, and older releases ended earlier. The Extended Life Cycle Support add-on is a separate paid subscription."
layout: doc
permalink: "/rules/container.host-rhel.eol-7-and-older.html"
canonical_url: "https://arminazimi.github.io/evergreen/rules/container.host-rhel.eol-7-and-older.html"
image: "/assets/og/container.host-rhel.eol-7-and-older.svg"
review_date: "2026-10-30"
last_modified_at: "2026-10-30"
json_twin: "/rules/container.host-rhel.eol-7-and-older.json"
---

# Red Hat Enterprise Linux 7 and older are past maintenance support

**End of life** as of 2024-06-30. Replacement: RHEL 8, 9, or 10. Source: [Red Hat Enterprise Linux 7 end of maintenance](https://www.redhat.com/en/technologies/linux-platforms/enterprise-linux/rhel-7-end-of-maintenance).

Check a version:

```bash
evergreen check pkg:generic/rhel
```

RHEL 7 reached the end of its maintenance support phase on 2024-06-30, and older releases ended earlier. The Extended Life Cycle Support add-on is a separate paid subscription.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `container` |
| Component | `pkg:generic/rhel` |
| Affected versions | `vers:semver/<8.0.0` |
| Date from the source | 2024-06-30 |
| Replacement | RHEL 8, 9, or 10 |
| Evidence last seen | 2026-10-30 |
| Reviewed | 2026-10-30 by arminazimi, drafted by the `endoflife-date` importer |
| Review due | 2027-10-30 (365 days after the last review) |
| Rule ID | `container.host-rhel.eol-7-and-older` |

## Sources

- [Red Hat Enterprise Linux 7 end of maintenance](https://www.redhat.com/en/technologies/linux-platforms/enterprise-linux/rhel-7-end-of-maintenance) (accessed 2026-10-30)
- [Red Hat product life cycles](https://access.redhat.com/product-life-cycles) (accessed 2026-10-30)

## Migration

**Constraints**

- Use Leapp or the supported in-place upgrade path, or rebuild the host on the target major release.
- Extended Life Cycle Support is a separate paid subscription; do not count it as standard maintenance.

**Steps**

1. **Upgrade the RHEL host.** Move the host to a supported RHEL major release, confirm subscriptions and third-party packages, then drain and return it to service.

**Verification**

- `cat /etc/redhat-release`: Confirm the host reports the target RHEL release.
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

This page is generated from [`registry/container.json`](https://github.com/arminazimi/evergreen/blob/main/registry/container.json), rule `container.host-rhel.eol-7-and-older`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/container.host-rhel.eol-7-and-older.html",
      "url": "https://arminazimi.github.io/evergreen/rules/container.host-rhel.eol-7-and-older.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/container.host-rhel.eol-7-and-older.html",
      "headline": "Red Hat Enterprise Linux 7 and older are past maintenance support — dates, impact, migration",
      "description": "RHEL 7 reached the end of its maintenance support phase on 2024-06-30, and older releases ended earlier. The Extended Life Cycle Support add-on is a separate paid subscription.",
      "inLanguage": "en",
      "dateModified": "2026-10-30",
      "keywords": [
        "end-of-life",
        "container",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "Red Hat Enterprise Linux 7 and older are past maintenance support",
        "identifier": "pkg:generic/rhel"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Red Hat Enterprise Linux 7 end of maintenance",
          "url": "https://www.redhat.com/en/technologies/linux-platforms/enterprise-linux/rhel-7-end-of-maintenance"
        },
        {
          "@type": "CreativeWork",
          "name": "Red Hat product life cycles",
          "url": "https://access.redhat.com/product-life-cycles"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/container.host-rhel.eol-7-and-older.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/container.host-rhel.eol-7-and-older.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/rhel?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life as of 2024-06-30. Affected versions: vers:semver/\u003c8.0.0. Source: Red Hat Enterprise Linux 7 end of maintenance (https://www.redhat.com/en/technologies/linux-platforms/enterprise-linux/rhel-7-end-of-maintenance)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/rhel?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "RHEL 8, 9, or 10"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/rhel?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/rhel."
          }
        }
      ]
    }
  ]
}
</script>
