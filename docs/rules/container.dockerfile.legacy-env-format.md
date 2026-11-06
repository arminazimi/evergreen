---
title: "The Dockerfile legacy \"ENV key value\" form is deprecated — dates, impact, migration"
description: "Docker's LegacyKeyValueFormat build check flags the space-separated ENV form and recommends writing each assignment as key=value."
layout: doc
permalink: "/rules/container.dockerfile.legacy-env-format.html"
canonical_url: "https://arminazimi.github.io/evergreen/rules/container.dockerfile.legacy-env-format.html"
image: "/assets/og/container.dockerfile.legacy-env-format.svg"
review_date: "2026-10-31"
last_modified_at: "2026-10-31"
json_twin: "/rules/container.dockerfile.legacy-env-format.json"
---

# The Dockerfile legacy "ENV key value" form is deprecated

**Deprecated.** The source gives no day. Replacement: The ENV key=value form, with the value quoted when it contains spaces. Source: [Docker build check: LegacyKeyValueFormat](https://docs.docker.com/reference/build-checks/legacy-key-value-format/).

Check a version:

```bash
evergreen check pkg:generic/dockerfile
```

Docker's LegacyKeyValueFormat build check flags the space-separated ENV form and recommends writing each assignment as key=value.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | low |
| Ecosystem | `container` |
| Component | `pkg:generic/dockerfile` |
| Affected versions | `vers:semver/*` |
| Date from the source | The source gives no day |
| Replacement | The ENV key=value form, with the value quoted when it contains spaces |
| Evidence last seen | 2026-10-31 |
| Reviewed | 2026-10-31 by arminazimi |
| Review due | 2027-10-31 (365 days after the last review) |
| Rule ID | `container.dockerfile.legacy-env-format` |

## Sources

- [Docker build check: LegacyKeyValueFormat](https://docs.docker.com/reference/build-checks/legacy-key-value-format/) (accessed 2026-10-31)
- [Dockerfile reference: ENV](https://docs.docker.com/reference/dockerfile/#env) (accessed 2026-10-31)

## Migration

**Constraints**

- Keep the variable name and its value unchanged.
- Use one key=value assignment per variable.

**Steps**

1. **Write the variable as key=value.** Replace ENV key value with ENV key="value", quoting the value when it contains spaces.

**Verification**

- `docker build .`: Build the image with the rewritten Dockerfile.
- `docker run --rm IMAGE env`: Confirm the variable keeps its name and value.

## Detected by

The [`container`](../detectors/container.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Other versions of this product

- [The Dockerfile MAINTAINER instruction is deprecated](container.dockerfile.maintainer.html)

### Same ecosystem

- [Alpine Linux image release lines 3.20 and older are end-of-life](container.alpine.eol-3.20-and-older.html)
- [Alpine Linux image release line 3.21 reaches end-of-life on 2026-11-01](container.alpine.eol-3.21.html)
- [Caddy image release lines 1 and older are end-of-life](container.caddy.eol-1-and-older.html)
- [ClickHouse image release lines 26.2 and older are end-of-life](container.clickhouse.eol-26.2-and-older.html)
- [Couchbase Server image release lines 7.2 and older are end-of-life](container.couchbase.eol-7.2-and-older.html)
- [Apache CouchDB image release lines 3.3 and older are end-of-life](container.couchdb.eol-3.3-and-older.html)
- [Debian image release lines 11 and older are end-of-life](container.debian.eol-11-and-older.html)
- [Drupal image release lines 10.5 and older are end-of-life](container.drupal.eol-10.5-and-older.html)


## Data

This page is generated from [`registry/container.json`](https://github.com/arminazimi/evergreen/blob/main/registry/container.json), rule `container.dockerfile.legacy-env-format`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/container.dockerfile.legacy-env-format.html",
      "url": "https://arminazimi.github.io/evergreen/rules/container.dockerfile.legacy-env-format.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/container.dockerfile.legacy-env-format.html",
      "headline": "The Dockerfile legacy \"ENV key value\" form is deprecated — dates, impact, migration",
      "description": "Docker's LegacyKeyValueFormat build check flags the space-separated ENV form and recommends writing each assignment as key=value.",
      "inLanguage": "en",
      "dateModified": "2026-10-31",
      "keywords": [
        "deprecated",
        "container",
        "low"
      ],
      "about": {
        "@type": "Thing",
        "name": "The Dockerfile legacy \"ENV key value\" form is deprecated",
        "identifier": "pkg:generic/dockerfile"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Docker build check: LegacyKeyValueFormat",
          "url": "https://docs.docker.com/reference/build-checks/legacy-key-value-format/"
        },
        {
          "@type": "CreativeWork",
          "name": "Dockerfile reference: ENV",
          "url": "https://docs.docker.com/reference/dockerfile/#env"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/container.dockerfile.legacy-env-format.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/container.dockerfile.legacy-env-format.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/dockerfile?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated. The source gives no day. Affected versions: vers:semver/*. Source: Docker build check: LegacyKeyValueFormat (https://docs.docker.com/reference/build-checks/legacy-key-value-format/)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/dockerfile?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The ENV key=value form, with the value quoted when it contains spaces"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/dockerfile?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/dockerfile."
          }
        }
      ]
    }
  ]
}
</script>
