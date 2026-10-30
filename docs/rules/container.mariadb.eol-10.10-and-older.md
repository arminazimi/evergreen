---
title: "MariaDB image release lines 10.10 and older are end-of-life — dates, impact, migration"
description: "These MariaDB release lines no longer receive fixes from the vendor."
canonical_url: "https://arminazimi.github.io/evergreen/rules/container.mariadb.eol-10.10-and-older.html"
json_twin: "/rules/container.mariadb.eol-10.10-and-older.json"
---

# MariaDB image release lines 10.10 and older are end-of-life

**End of life** as of 2026-07-06. Replacement: A mariadb image on a supported release line. Source: [MariaDB release policy (vendor)](https://mariadb.org/about/#maintenance-policy).

Check a version:

```bash
evergreen check pkg:docker/library/mariadb
```

These MariaDB release lines no longer receive fixes from the vendor.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `container` |
| Component | `pkg:docker/library/mariadb` |
| Affected versions | `vers:semver/<10.11.0` |
| Date from the source | 2026-07-06 |
| Replacement | A mariadb image on a supported release line |
| Evidence last seen | 2026-10-20 |
| Reviewed | 2026-10-20 by arminazimi, drafted by the `endoflife-date` importer |
| Review due | 2027-10-20 (365 days after the last review) |
| Rule ID | `container.mariadb.eol-10.10-and-older` |

## Sources

- [MariaDB release policy (vendor)](https://mariadb.org/about/#maintenance-policy)

## Migration

**Constraints**

- Keep the base image, Compose image, CI service containers, and deployment manifests that use mariadb on one supported MariaDB release line.
- Confirm the application and its data or configuration work on the target MariaDB release; read the vendor's upgrade notes before moving across several release lines.

**Steps**

1. **Update the base image.** Change the reported FROM line or Compose image to a tag on a supported release line, and pin it to a digest if your policy requires.
2. **Align other image references.** Update other Dockerfiles, Compose files, CI service containers, and deployment manifests that use the same image so they agree.

**Verification**

- `docker build .`: Build the image on the new base.
- `docker run --rm IMAGE sh -c 'echo ok'`: Confirm the container starts on the new base.

## Detected by

The [`container`](../detectors/container.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/container.json`](https://github.com/arminazimi/evergreen/blob/main/registry/container.json), rule `container.mariadb.eol-10.10-and-older`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/container.mariadb.eol-10.10-and-older.html",
      "url": "https://arminazimi.github.io/evergreen/rules/container.mariadb.eol-10.10-and-older.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/container.mariadb.eol-10.10-and-older.html",
      "headline": "MariaDB image release lines 10.10 and older are end-of-life — dates, impact, migration",
      "description": "These MariaDB release lines no longer receive fixes from the vendor.",
      "inLanguage": "en",
      "dateModified": "2026-10-20",
      "keywords": [
        "end-of-life",
        "container",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "MariaDB image release lines 10.10 and older are end-of-life",
        "identifier": "pkg:docker/library/mariadb"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "MariaDB release policy (vendor)",
          "url": "https://mariadb.org/about/#maintenance-policy"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/container.mariadb.eol-10.10-and-older.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/container.mariadb.eol-10.10-and-older.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:docker/library/mariadb?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life as of 2026-07-06. Affected versions: vers:semver/\u003c10.11.0. Source: MariaDB release policy (vendor) (https://mariadb.org/about/#maintenance-policy)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:docker/library/mariadb?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A mariadb image on a supported release line"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:docker/library/mariadb?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:docker/library/mariadb."
          }
        }
      ]
    }
  ]
}
</script>
