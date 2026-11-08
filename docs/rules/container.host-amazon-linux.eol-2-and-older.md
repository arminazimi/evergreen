---
title: "Amazon Linux 2 and the 2018.03 AMI are past end of support — dates, impact, migration"
description: "Amazon Linux 2 reached the end of standard support on 2026-06-30, and Amazon Linux AMI 2018.03 ended support on 2023-12-31. Amazon Linux 2023 is supported until 2029-06-30."
layout: doc
permalink: "/rules/container.host-amazon-linux.eol-2-and-older.html"
canonical_url: "https://arminazimi.github.io/evergreen/rules/container.host-amazon-linux.eol-2-and-older.html"
image: "/assets/og/container.host-amazon-linux.eol-2-and-older.svg"
review_date: "2026-10-30"
last_modified_at: "2026-10-30"
json_twin: "/rules/container.host-amazon-linux.eol-2-and-older.json"
---

# Amazon Linux 2 and the 2018.03 AMI are past end of support

**End of life** as of 2026-06-30. Replacement: Amazon Linux 2023. Source: [Amazon Linux 2 release notes](https://docs.aws.amazon.com/AL2/latest/relnotes/relnotes-al2.html).

Check a version:

```bash
evergreen check pkg:generic/amzn
```

Amazon Linux 2 reached the end of standard support on 2026-06-30, and Amazon Linux AMI 2018.03 ended support on 2023-12-31. Amazon Linux 2023 is supported until 2029-06-30.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `container` |
| Component | `pkg:generic/amzn` |
| Affected versions | `vers:semver/<2023.0.0` |
| Date from the source | 2026-06-30 |
| Replacement | Amazon Linux 2023 |
| Evidence last seen | 2026-10-30 |
| Reviewed | 2026-10-30 by arminazimi, drafted by the `endoflife-date` importer |
| Review due | 2027-10-30 (365 days after the last review) |
| Rule ID | `container.host-amazon-linux.eol-2-and-older` |

## Sources

- [Amazon Linux 2 release notes](https://docs.aws.amazon.com/AL2/latest/relnotes/relnotes-al2.html) (accessed 2026-10-30)
- [Amazon Linux 2023 release cadence](https://docs.aws.amazon.com/linux/al2023/ug/release-cadence.html) (accessed 2026-10-30)

## Migration

**Constraints**

- Amazon Linux 2023 is a separate major release: rebuild the host rather than upgrading in place.
- Confirm installed packages and agents are available for Amazon Linux 2023 before switching.

**Steps**

1. **Replace the Amazon Linux host.** Launch a replacement host on Amazon Linux 2023 from the same configuration, then move traffic to it.

**Verification**

- `cat /etc/system-release`: Confirm the host reports Amazon Linux 2023.
- `dnf check-update`: Check that package updates resolve on the new host.

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

This page is generated from [`registry/container.json`](https://github.com/arminazimi/evergreen/blob/main/registry/container.json), rule `container.host-amazon-linux.eol-2-and-older`, in the `ebb.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/container.host-amazon-linux.eol-2-and-older.html",
      "url": "https://arminazimi.github.io/evergreen/rules/container.host-amazon-linux.eol-2-and-older.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/container.host-amazon-linux.eol-2-and-older.html",
      "headline": "Amazon Linux 2 and the 2018.03 AMI are past end of support — dates, impact, migration",
      "description": "Amazon Linux 2 reached the end of standard support on 2026-06-30, and Amazon Linux AMI 2018.03 ended support on 2023-12-31. Amazon Linux 2023 is supported until 2029-06-30.",
      "inLanguage": "en",
      "dateModified": "2026-10-30",
      "keywords": [
        "end-of-life",
        "container",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "Amazon Linux 2 and the 2018.03 AMI are past end of support",
        "identifier": "pkg:generic/amzn"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Amazon Linux 2 release notes",
          "url": "https://docs.aws.amazon.com/AL2/latest/relnotes/relnotes-al2.html"
        },
        {
          "@type": "CreativeWork",
          "name": "Amazon Linux 2023 release cadence",
          "url": "https://docs.aws.amazon.com/linux/al2023/ug/release-cadence.html"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/container.host-amazon-linux.eol-2-and-older.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/container.host-amazon-linux.eol-2-and-older.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/amzn?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life as of 2026-06-30. Affected versions: vers:semver/\u003c2023.0.0. Source: Amazon Linux 2 release notes (https://docs.aws.amazon.com/AL2/latest/relnotes/relnotes-al2.html)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/amzn?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Amazon Linux 2023"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/amzn?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/amzn."
          }
        }
      ]
    }
  ]
}
</script>
