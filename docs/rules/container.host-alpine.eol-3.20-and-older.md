---
title: "Alpine Linux 3.20 and older are end-of-life — dates, impact, migration"
description: "Alpine Linux 3.20, the newest release this range covers, stopped receiving security updates on 2026-04-01; older release branches ended earlier. Each branch is supported for about two years."
layout: doc
permalink: "/rules/container.host-alpine.eol-3.20-and-older.html"
canonical_url: "https://arminazimi.github.io/evergreen/rules/container.host-alpine.eol-3.20-and-older.html"
image: "/assets/og/container.host-alpine.eol-3.20-and-older.svg"
review_date: "2026-10-30"
last_modified_at: "2026-10-30"
json_twin: "/rules/container.host-alpine.eol-3.20-and-older.json"
---

# Alpine Linux 3.20 and older are end-of-life

**End of life** as of 2026-04-01. Replacement: Alpine Linux 3.21 or later. Source: [Alpine Linux releases](https://alpinelinux.org/releases/).

Check a version:

```bash
evergreen check pkg:generic/alpine
```

Alpine Linux 3.20, the newest release this range covers, stopped receiving security updates on 2026-04-01; older release branches ended earlier. Each branch is supported for about two years.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `container` |
| Component | `pkg:generic/alpine` |
| Affected versions | `vers:semver/<3.21.0` |
| Date from the source | 2026-04-01 |
| Replacement | Alpine Linux 3.21 or later |
| Evidence last seen | 2026-10-30 |
| Reviewed | 2026-10-30 by arminazimi, drafted by the `endoflife-date` importer |
| Review due | 2027-10-30 (365 days after the last review) |
| Rule ID | `container.host-alpine.eol-3.20-and-older` |

## Sources

- [Alpine Linux releases](https://alpinelinux.org/releases/)

## Migration

**Constraints**

- Upgrade one Alpine branch at a time and reinstall packages from the target repositories.
- Confirm services and pinned packages have builds for the target branch.

**Steps**

1. **Upgrade the Alpine host.** Move the host to a supported Alpine branch with the documented upgrade procedure, or rebuild it and redeploy the workload.

**Verification**

- `cat /etc/alpine-release`: Confirm the host reports the target Alpine branch.
- `apk update`: Check that the target repositories are reachable and current.

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

This page is generated from [`registry/container.json`](https://github.com/arminazimi/evergreen/blob/main/registry/container.json), rule `container.host-alpine.eol-3.20-and-older`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/container.host-alpine.eol-3.20-and-older.html",
      "url": "https://arminazimi.github.io/evergreen/rules/container.host-alpine.eol-3.20-and-older.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/container.host-alpine.eol-3.20-and-older.html",
      "headline": "Alpine Linux 3.20 and older are end-of-life — dates, impact, migration",
      "description": "Alpine Linux 3.20, the newest release this range covers, stopped receiving security updates on 2026-04-01; older release branches ended earlier. Each branch is supported for about two years.",
      "inLanguage": "en",
      "dateModified": "2026-10-30",
      "keywords": [
        "end-of-life",
        "container",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "Alpine Linux 3.20 and older are end-of-life",
        "identifier": "pkg:generic/alpine"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Alpine Linux releases",
          "url": "https://alpinelinux.org/releases/"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/container.host-alpine.eol-3.20-and-older.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/container.host-alpine.eol-3.20-and-older.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/alpine?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life as of 2026-04-01. Affected versions: vers:semver/\u003c3.21.0. Source: Alpine Linux releases (https://alpinelinux.org/releases/)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/alpine?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Alpine Linux 3.21 or later"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/alpine?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/alpine."
          }
        }
      ]
    }
  ]
}
</script>
