---
title: "Ubuntu releases before 22.04 LTS are past standard support — dates, impact, migration"
description: "Ubuntu 20.04 LTS, the newest release this range covers, stopped receiving standard security updates on 2025-05-31; interim releases in the range ended earlier."
layout: doc
permalink: "/rules/container.host-ubuntu.eol-22.04-and-older.html"
canonical_url: "https://arminazimi.github.io/evergreen/rules/container.host-ubuntu.eol-22.04-and-older.html"
image: "/assets/og/container.host-ubuntu.eol-22.04-and-older.svg"
review_date: "2026-10-30"
last_modified_at: "2026-10-30"
json_twin: "/rules/container.host-ubuntu.eol-22.04-and-older.json"
---

# Ubuntu releases before 22.04 LTS are past standard support

**End of life** as of 2025-05-31. Replacement: An Ubuntu release in standard support, such as 24.04 LTS. Source: [Ubuntu release cycle](https://ubuntu.com/about/release-cycle).

Check a version:

```bash
evergreen check pkg:generic/ubuntu
```

Ubuntu 20.04 LTS, the newest release this range covers, stopped receiving standard security updates on 2025-05-31; interim releases in the range ended earlier. Extended Security Maintenance is a separate paid subscription.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `container` |
| Component | `pkg:generic/ubuntu` |
| Affected versions | `vers:semver/<22.0.0` |
| Date from the source | 2025-05-31 |
| Replacement | An Ubuntu release in standard support, such as 24.04 LTS |
| Evidence last seen | 2026-10-30 |
| Reviewed | 2026-10-30 by arminazimi, drafted by the `endoflife-date` importer |
| Review due | 2027-10-30 (365 days after the last review) |
| Rule ID | `container.host-ubuntu.eol-22.04-and-older` |

## Sources

- [Ubuntu release cycle](https://ubuntu.com/about/release-cycle)

## Migration

**Constraints**

- Upgrade one release at a time, or rebuild the host on the target LTS and redeploy the workload.
- Extended Security Maintenance is a separate paid subscription; do not count it as standard support.

**Steps**

1. **Upgrade the Ubuntu host.** Move the host to a supported Ubuntu LTS, confirm pinned packages and services, then drain and return it to service.

**Verification**

- `lsb_release -a`: Confirm the host reports the target Ubuntu release.
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

This page is generated from [`registry/container.json`](https://github.com/arminazimi/evergreen/blob/main/registry/container.json), rule `container.host-ubuntu.eol-22.04-and-older`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/container.host-ubuntu.eol-22.04-and-older.html",
      "url": "https://arminazimi.github.io/evergreen/rules/container.host-ubuntu.eol-22.04-and-older.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/container.host-ubuntu.eol-22.04-and-older.html",
      "headline": "Ubuntu releases before 22.04 LTS are past standard support — dates, impact, migration",
      "description": "Ubuntu 20.04 LTS, the newest release this range covers, stopped receiving standard security updates on 2025-05-31; interim releases in the range ended earlier.",
      "inLanguage": "en",
      "dateModified": "2026-10-30",
      "keywords": [
        "end-of-life",
        "container",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "Ubuntu releases before 22.04 LTS are past standard support",
        "identifier": "pkg:generic/ubuntu"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Ubuntu release cycle",
          "url": "https://ubuntu.com/about/release-cycle"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/container.host-ubuntu.eol-22.04-and-older.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/container.host-ubuntu.eol-22.04-and-older.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/ubuntu?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life as of 2025-05-31. Affected versions: vers:semver/\u003c22.0.0. Source: Ubuntu release cycle (https://ubuntu.com/about/release-cycle)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/ubuntu?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "An Ubuntu release in standard support, such as 24.04 LTS"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/ubuntu?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/ubuntu."
          }
        }
      ]
    }
  ]
}
</script>
