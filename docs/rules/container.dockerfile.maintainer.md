---
title: "The Dockerfile MAINTAINER instruction is deprecated — dates, impact, migration"
description: "The Dockerfile reference marks MAINTAINER as deprecated because author metadata belongs in the org.opencontainers.image.authors label."
layout: doc
permalink: "/rules/container.dockerfile.maintainer.html"
canonical_url: "https://arminazimi.github.io/evergreen/rules/container.dockerfile.maintainer.html"
image: "/assets/og/container.dockerfile.maintainer.svg"
review_date: "2026-10-31"
last_modified_at: "2026-10-31"
json_twin: "/rules/container.dockerfile.maintainer.json"
---

# The Dockerfile MAINTAINER instruction is deprecated

**Deprecated.** The source gives no day. Replacement: A LABEL org.opencontainers.image.authors instruction carrying the same author text. Source: [Dockerfile reference: MAINTAINER (deprecated)](https://docs.docker.com/reference/dockerfile/#maintainer-deprecated).

Check a version:

```bash
evergreen check pkg:generic/dockerfile
```

The Dockerfile reference marks MAINTAINER as deprecated because author metadata belongs in the org.opencontainers.image.authors label.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | low |
| Ecosystem | `container` |
| Component | `pkg:generic/dockerfile` |
| Affected versions | `vers:semver/*` |
| Date from the source | The source gives no day |
| Replacement | A LABEL org.opencontainers.image.authors instruction carrying the same author text |
| Evidence last seen | 2026-10-31 |
| Reviewed | 2026-10-31 by arminazimi |
| Review due | 2027-10-31 (365 days after the last review) |
| Rule ID | `container.dockerfile.maintainer` |

## Sources

- [Dockerfile reference: MAINTAINER (deprecated)](https://docs.docker.com/reference/dockerfile/#maintainer-deprecated) (accessed 2026-10-31)
- [Docker build check: MaintainerDeprecated](https://docs.docker.com/reference/build-checks/maintainer-deprecated/) (accessed 2026-10-31)

## Migration

**Constraints**

- Keep the author text exactly as it is written.
- Quote the label value so spaces and punctuation stay part of the value.

**Steps**

1. **Replace MAINTAINER with the OCI author label.** Replace the MAINTAINER instruction with LABEL org.opencontainers.image.authors, using the same author text as a quoted value.

**Verification**

- `docker build .`: Build the image with the rewritten Dockerfile.
- `docker inspect IMAGE`: Confirm the image carries the org.opencontainers.image.authors label.

## Detected by

The [`container`](../detectors/container.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Other versions of this product

- [The Dockerfile legacy "ENV key value" form is deprecated](container.dockerfile.legacy-env-format.html)

### Same ecosystem

- [Alpine Linux image release lines 3.20 and older are end-of-life](container.alpine.eol-3.20-and-older.html)
- [Alpine Linux image release line 3.21 is end-of-life](container.alpine.eol-3.21.html)
- [Caddy image release lines 1 and older are end-of-life](container.caddy.eol-1-and-older.html)
- [ClickHouse image release lines 26.2 and older are end-of-life](container.clickhouse.eol-26.2-and-older.html)
- [Couchbase Server image release lines 7.2 and older are end-of-life](container.couchbase.eol-7.2-and-older.html)
- [Apache CouchDB image release lines 3.3 and older are end-of-life](container.couchdb.eol-3.3-and-older.html)
- [Debian image release lines 11 and older are end-of-life](container.debian.eol-11-and-older.html)
- [Drupal image release lines 10.5 and older are end-of-life](container.drupal.eol-10.5-and-older.html)


## Data

This page is generated from [`registry/container.json`](https://github.com/arminazimi/evergreen/blob/main/registry/container.json), rule `container.dockerfile.maintainer`, in the `ebb.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/container.dockerfile.maintainer.html",
      "url": "https://arminazimi.github.io/evergreen/rules/container.dockerfile.maintainer.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/container.dockerfile.maintainer.html",
      "headline": "The Dockerfile MAINTAINER instruction is deprecated — dates, impact, migration",
      "description": "The Dockerfile reference marks MAINTAINER as deprecated because author metadata belongs in the org.opencontainers.image.authors label.",
      "inLanguage": "en",
      "dateModified": "2026-10-31",
      "keywords": [
        "deprecated",
        "container",
        "low"
      ],
      "about": {
        "@type": "Thing",
        "name": "The Dockerfile MAINTAINER instruction is deprecated",
        "identifier": "pkg:generic/dockerfile"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Dockerfile reference: MAINTAINER (deprecated)",
          "url": "https://docs.docker.com/reference/dockerfile/#maintainer-deprecated"
        },
        {
          "@type": "CreativeWork",
          "name": "Docker build check: MaintainerDeprecated",
          "url": "https://docs.docker.com/reference/build-checks/maintainer-deprecated/"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/container.dockerfile.maintainer.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/container.dockerfile.maintainer.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/dockerfile?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated. The source gives no day. Affected versions: vers:semver/*. Source: Dockerfile reference: MAINTAINER (deprecated) (https://docs.docker.com/reference/dockerfile/#maintainer-deprecated)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/dockerfile?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A LABEL org.opencontainers.image.authors instruction carrying the same author text"
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
