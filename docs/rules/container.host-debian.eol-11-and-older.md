---
title: "Debian 11 and older are end-of-life — dates, impact, migration"
description: "Debian 11 reached the end of long-term support on 2026-08-31, and older releases ended earlier. These releases no longer receive security updates from the Debian project."
layout: doc
permalink: "/rules/container.host-debian.eol-11-and-older.html"
canonical_url: "https://arminazimi.github.io/evergreen/rules/container.host-debian.eol-11-and-older.html"
image: "/assets/og/container.host-debian.eol-11-and-older.svg"
review_date: "2026-10-30"
last_modified_at: "2026-10-30"
json_twin: "/rules/container.host-debian.eol-11-and-older.json"
---

# Debian 11 and older are end-of-life

**End of life** as of 2026-08-31. Replacement: Debian 12 or 13. Source: [Debian releases](https://www.debian.org/releases/).

Check a version:

```bash
evergreen check pkg:generic/debian
```

Debian 11 reached the end of long-term support on 2026-08-31, and older releases ended earlier. These releases no longer receive security updates from the Debian project.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `container` |
| Component | `pkg:generic/debian` |
| Affected versions | `vers:semver/<12.0.0` |
| Date from the source | 2026-08-31 |
| Replacement | Debian 12 or 13 |
| Evidence last seen | 2026-10-30 |
| Reviewed | 2026-10-30 by arminazimi, drafted by the `endoflife-date` importer |
| Review due | 2027-10-30 (365 days after the last review) |
| Rule ID | `container.host-debian.eol-11-and-older` |

## Sources

- [Debian releases](https://www.debian.org/releases/) (accessed 2026-10-30)
- [Debian Long Term Support](https://wiki.debian.org/LTS) (accessed 2026-10-30)

## Migration

**Constraints**

- Follow the Debian release notes across every intermediate release; do not skip a major release.
- Confirm third-party repositories and held packages support the target release before upgrading.

**Steps**

1. **Upgrade the Debian host.** Move the host to a supported Debian release with the documented upgrade procedure, or rebuild it and redeploy the workload.

**Verification**

- `cat /etc/debian_version`: Confirm the host reports the target Debian release.
- `apt-get -s upgrade`: Check that package upgrades resolve on the target release.

## Detected by

The [`container`](../detectors/container.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Same ecosystem

- [Alpine Linux image release lines 3.20 and older are end-of-life](container.alpine.eol-3.20-and-older.html)
- [Alpine Linux image release line 3.21 reaches end-of-life on 2026-11-01](container.alpine.eol-3.21.html)
- [Caddy image release lines 1 and older are end-of-life](container.caddy.eol-1-and-older.html)
- [ClickHouse image release lines 26.2 and older are end-of-life](container.clickhouse.eol-26.2-and-older.html)
- [Couchbase Server image release lines 7.2 and older are end-of-life](container.couchbase.eol-7.2-and-older.html)
- [Apache CouchDB image release lines 3.3 and older are end-of-life](container.couchdb.eol-3.3-and-older.html)
- [Debian image release lines 11 and older are end-of-life](container.debian.eol-11-and-older.html)
- [The Dockerfile legacy "ENV key value" form is deprecated](container.dockerfile.legacy-env-format.html)


## Data

This page is generated from [`registry/container.json`](https://github.com/arminazimi/evergreen/blob/main/registry/container.json), rule `container.host-debian.eol-11-and-older`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/container.host-debian.eol-11-and-older.html",
      "url": "https://arminazimi.github.io/evergreen/rules/container.host-debian.eol-11-and-older.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/container.host-debian.eol-11-and-older.html",
      "headline": "Debian 11 and older are end-of-life — dates, impact, migration",
      "description": "Debian 11 reached the end of long-term support on 2026-08-31, and older releases ended earlier. These releases no longer receive security updates from the Debian project.",
      "inLanguage": "en",
      "dateModified": "2026-10-30",
      "keywords": [
        "end-of-life",
        "container",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "Debian 11 and older are end-of-life",
        "identifier": "pkg:generic/debian"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Debian releases",
          "url": "https://www.debian.org/releases/"
        },
        {
          "@type": "CreativeWork",
          "name": "Debian Long Term Support",
          "url": "https://wiki.debian.org/LTS"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/container.host-debian.eol-11-and-older.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/container.host-debian.eol-11-and-older.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/debian?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life as of 2026-08-31. Affected versions: vers:semver/\u003c12.0.0. Source: Debian releases (https://www.debian.org/releases/)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/debian?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Debian 12 or 13"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/debian?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/debian."
          }
        }
      ]
    }
  ]
}
</script>
