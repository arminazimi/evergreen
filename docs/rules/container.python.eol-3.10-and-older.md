---
title: "Python image release lines 3.10 and older are end-of-life — dates, impact, migration"
description: "These Python release lines no longer receive security or bug fixes from the Python core team."
canonical_url: "https://arminazimi.github.io/evergreen/rules/container.python.eol-3.10-and-older.html"
json_twin: "/rules/container.python.eol-3.10-and-older.json"
---

# Python image release lines 3.10 and older are end-of-life

**End of life** as of 2026-10-01. Replacement: A python image on a supported release line. Source: [Status of Python versions](https://devguide.python.org/versions/).

Check a version:

```bash
evergreen check pkg:docker/library/python
```

These Python release lines no longer receive security or bug fixes from the Python core team.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `container` |
| Component | `pkg:docker/library/python` |
| Affected versions | `vers:semver/<3.11.0` |
| Date from the source | 2026-10-01 |
| Replacement | A python image on a supported release line |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi, drafted by the `container-official-images` importer |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `container.python.eol-3.10-and-older` |

## Sources

- [Status of Python versions](https://devguide.python.org/versions/)
- [Python release cycle (machine-readable)](https://peps.python.org/api/release-cycle.json)

## Migration

**Constraints**

- Keep the base image, requires-python, CI matrices, and deployment runtimes on one supported Python release.
- Confirm binary wheels and dependencies support the target Python release; rebuild any virtual environment or wheel cache inside the image.

**Steps**

1. **Update the base image.** Change the reported FROM line or Compose image to a tag on a supported release line, and pin it to a digest if your policy requires.
2. **Align other image references.** Update other Dockerfiles, Compose files, CI service containers, and deployment manifests that use the same image so they agree.

**Verification**

- `docker build .`: Build the image on the new base.
- `docker run --rm IMAGE python --version`: Confirm the container runs the intended Python version.

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
- [Drupal image release lines 10.5 and older are end-of-life](container.drupal.eol-10.5-and-older.html)


## Data

This page is generated from [`registry/container.json`](https://github.com/arminazimi/evergreen/blob/main/registry/container.json), rule `container.python.eol-3.10-and-older`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/container.python.eol-3.10-and-older.html",
      "url": "https://arminazimi.github.io/evergreen/rules/container.python.eol-3.10-and-older.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/container.python.eol-3.10-and-older.html",
      "headline": "Python image release lines 3.10 and older are end-of-life — dates, impact, migration",
      "description": "These Python release lines no longer receive security or bug fixes from the Python core team.",
      "inLanguage": "en",
      "dateModified": "2026-10-16",
      "keywords": [
        "end-of-life",
        "container",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "Python image release lines 3.10 and older are end-of-life",
        "identifier": "pkg:docker/library/python"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Status of Python versions",
          "url": "https://devguide.python.org/versions/"
        },
        {
          "@type": "CreativeWork",
          "name": "Python release cycle (machine-readable)",
          "url": "https://peps.python.org/api/release-cycle.json"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/container.python.eol-3.10-and-older.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/container.python.eol-3.10-and-older.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:docker/library/python?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life as of 2026-10-01. Affected versions: vers:semver/\u003c3.11.0. Source: Status of Python versions (https://devguide.python.org/versions/)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:docker/library/python?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A python image on a supported release line"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:docker/library/python?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:docker/library/python."
          }
        }
      ]
    }
  ]
}
</script>
