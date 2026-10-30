---
title: "Apache ZooKeeper image release lines 3.7 and older are end-of-life — dates, impact, migration"
description: "These Apache ZooKeeper release lines no longer receive fixes from the vendor."
canonical_url: "https://arminazimi.github.io/evergreen/rules/container.zookeeper.eol-3.7-and-older.html"
image: "/assets/og/container.zookeeper.eol-3.7-and-older.svg"
json_twin: "/rules/container.zookeeper.eol-3.7-and-older.json"
---

# Apache ZooKeeper image release lines 3.7 and older are end-of-life

**End of life** as of 2024-01-19. Replacement: A zookeeper image on a supported release line. Source: [Apache ZooKeeper release policy (vendor)](https://zookeeper.apache.org/releases/).

Check a version:

```bash
evergreen check pkg:docker/library/zookeeper
```

These Apache ZooKeeper release lines no longer receive fixes from the vendor.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `container` |
| Component | `pkg:docker/library/zookeeper` |
| Affected versions | `vers:semver/<3.8.0` |
| Date from the source | 2024-01-19 |
| Replacement | A zookeeper image on a supported release line |
| Evidence last seen | 2026-10-20 |
| Reviewed | 2026-10-20 by arminazimi, drafted by the `endoflife-date` importer |
| Review due | 2027-10-20 (365 days after the last review) |
| Rule ID | `container.zookeeper.eol-3.7-and-older` |

## Sources

- [Apache ZooKeeper release policy (vendor)](https://zookeeper.apache.org/releases/)

## Migration

**Constraints**

- Keep the base image, Compose image, CI service containers, and deployment manifests that use zookeeper on one supported ZooKeeper release line.
- Confirm the application and its data or configuration work on the target ZooKeeper release; read the vendor's upgrade notes before moving across several release lines.

**Steps**

1. **Update the base image.** Change the reported FROM line or Compose image to a tag on a supported release line, and pin it to a digest if your policy requires.
2. **Align other image references.** Update other Dockerfiles, Compose files, CI service containers, and deployment manifests that use the same image so they agree.

**Verification**

- `docker build .`: Build the image on the new base.
- `docker run --rm IMAGE sh -c 'echo ok'`: Confirm the container starts on the new base.

## Detected by

The [`container`](../detectors/container.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/container.json`](https://github.com/arminazimi/evergreen/blob/main/registry/container.json), rule `container.zookeeper.eol-3.7-and-older`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/container.zookeeper.eol-3.7-and-older.html",
      "url": "https://arminazimi.github.io/evergreen/rules/container.zookeeper.eol-3.7-and-older.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/container.zookeeper.eol-3.7-and-older.html",
      "headline": "Apache ZooKeeper image release lines 3.7 and older are end-of-life — dates, impact, migration",
      "description": "These Apache ZooKeeper release lines no longer receive fixes from the vendor.",
      "inLanguage": "en",
      "dateModified": "2026-10-20",
      "keywords": [
        "end-of-life",
        "container",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "Apache ZooKeeper image release lines 3.7 and older are end-of-life",
        "identifier": "pkg:docker/library/zookeeper"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Apache ZooKeeper release policy (vendor)",
          "url": "https://zookeeper.apache.org/releases/"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/container.zookeeper.eol-3.7-and-older.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/container.zookeeper.eol-3.7-and-older.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:docker/library/zookeeper?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life as of 2024-01-19. Affected versions: vers:semver/\u003c3.8.0. Source: Apache ZooKeeper release policy (vendor) (https://zookeeper.apache.org/releases/)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:docker/library/zookeeper?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A zookeeper image on a supported release line"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:docker/library/zookeeper?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:docker/library/zookeeper."
          }
        }
      ]
    }
  ]
}
</script>
