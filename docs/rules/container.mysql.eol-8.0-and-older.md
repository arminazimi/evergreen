---
title: "MySQL image release lines 8.0 and older are past end-of-life"
description: "Oracle lists MySQL 8.0 and 5.7 as covered only by Sustaining Support, which means no new fixes."
---

# MySQL image release lines 8.0 and older are past end-of-life

Oracle lists MySQL 8.0 and 5.7 as covered only by Sustaining Support, which means no new fixes.

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `container` |
| Component | `pkg:docker/library/mysql` |
| Affected versions | `vers:semver/<8.1.0` |
| Date from the source | 2026-04-21 |
| Replacement | A mysql image on a supported release such as the 8.4 LTS line |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `container.mysql.eol-8.0-and-older` |

## Sources

- [MySQL end-of-life notice](https://www.mysql.com/support/eol-notice.html)

## Migration

**Constraints**

- A new MySQL release line can need a data directory upgrade; read the upgrade notes and take a backup before starting the new image on existing data.
- Check SQL modes, authentication plugins, and client libraries against the target release.

**Steps**

1. **Update the base image.** Change the reported FROM line or Compose image to a tag on a supported release line, and pin it to a digest if your policy requires.
2. **Align other image references.** Update other Dockerfiles, Compose files, CI service containers, and deployment manifests that use the same image so they agree.

**Verification**

- `docker compose config`: Validate the Compose file after changing the image tag.
- `docker compose run --rm db mysqld --version`: Confirm the database container runs the intended release (service name may differ).

## Detected by

The [`container`](../detectors/container.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/container.json`](https://github.com/arminazimi/evergreen/blob/main/registry/container.json), rule `container.mysql.eol-8.0-and-older`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/container.mysql.eol-8.0-and-older.html",
  "url": "https://arminazimi.github.io/evergreen/rules/container.mysql.eol-8.0-and-older.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/container.mysql.eol-8.0-and-older.html",
  "headline": "MySQL image release lines 8.0 and older are past end-of-life",
  "description": "Oracle lists MySQL 8.0 and 5.7 as covered only by Sustaining Support, which means no new fixes.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "end-of-life",
    "container",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "MySQL image release lines 8.0 and older are past end-of-life",
    "identifier": "pkg:docker/library/mysql"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "MySQL end-of-life notice",
      "url": "https://www.mysql.com/support/eol-notice.html"
    }
  ],
  "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/container.json",
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen"
  }
}
</script>
