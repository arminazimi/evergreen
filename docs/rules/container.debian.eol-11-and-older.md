---
title: "Debian image release lines 11 and older are end-of-life — dates, impact, migration"
description: "These Debian releases no longer receive LTS security updates from the vendor."
canonical_url: "https://arminazimi.github.io/evergreen/rules/container.debian.eol-11-and-older.html"
json_twin: "/rules/container.debian.eol-11-and-older.json"
---

# Debian image release lines 11 and older are end-of-life

**End of life** as of 2026-08-31. Replacement: A debian image on a supported release line. Source: [Debian LTS](https://wiki.debian.org/LTS).

Check a version:

```bash
evergreen check pkg:docker/library/debian
```

These Debian releases no longer receive LTS security updates from the vendor.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `container` |
| Component | `pkg:docker/library/debian` |
| Affected versions | `vers:semver/<12.0.0` |
| Date from the source | 2026-08-31 |
| Replacement | A debian image on a supported release line |
| Evidence last seen | 2026-10-26 |
| Reviewed | 2026-10-26 by arminazimi |
| Review due | 2027-10-26 (365 days after the last review) |
| Rule ID | `container.debian.eol-11-and-older` |

## Sources

- [Debian LTS](https://wiki.debian.org/LTS)
- [Debian Releases](https://www.debian.org/releases/)

## Migration

**Constraints**

- Keep the base image and deployment manifests that use debian on one supported Debian release line.
- Confirm the application and its dependencies work on the target Debian release.

**Steps**

1. **Update the base image.** Change the reported FROM line or Compose image to a tag on a supported release line, and pin it to a digest if your policy requires.
2. **Align other image references.** Update other Dockerfiles, Compose files, CI service containers, and deployment manifests that use the same image so they agree.

**Verification**

- `docker build .`: Build the image on the new base.
- `docker run --rm IMAGE sh -c 'echo ok'`: Confirm the container starts on the new base.

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
- [Drupal image release lines 10.5 and older are end-of-life](container.drupal.eol-10.5-and-older.html)
- [Go image release lines 1.25 and older are end-of-life](container.golang.eol-1.25-and-older.html)


## Data

This page is generated from [`registry/container.json`](https://github.com/arminazimi/evergreen/blob/main/registry/container.json), rule `container.debian.eol-11-and-older`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/container.debian.eol-11-and-older.html",
      "url": "https://arminazimi.github.io/evergreen/rules/container.debian.eol-11-and-older.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/container.debian.eol-11-and-older.html",
      "headline": "Debian image release lines 11 and older are end-of-life — dates, impact, migration",
      "description": "These Debian releases no longer receive LTS security updates from the vendor.",
      "inLanguage": "en",
      "dateModified": "2026-10-26",
      "keywords": [
        "end-of-life",
        "container",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "Debian image release lines 11 and older are end-of-life",
        "identifier": "pkg:docker/library/debian"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Debian LTS",
          "url": "https://wiki.debian.org/LTS"
        },
        {
          "@type": "CreativeWork",
          "name": "Debian Releases",
          "url": "https://www.debian.org/releases/"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/container.debian.eol-11-and-older.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/container.debian.eol-11-and-older.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:docker/library/debian?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life as of 2026-08-31. Affected versions: vers:semver/\u003c12.0.0. Source: Debian LTS (https://wiki.debian.org/LTS)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:docker/library/debian?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A debian image on a supported release line"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:docker/library/debian?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:docker/library/debian."
          }
        }
      ]
    }
  ]
}
</script>
