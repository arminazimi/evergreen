---
title: "PostgreSQL image release line 14 reaches end-of-life on 2026-11-12 — dates, impact, migration"
description: "The PostgreSQL 14 release line is scheduled to stop receiving fixes from the vendor on 2026-11-12."
canonical_url: "https://arminazimi.github.io/evergreen/rules/container.postgres.eol-14-and-older.html"
---

# PostgreSQL image release line 14 reaches end-of-life on 2026-11-12

The PostgreSQL 14 release line is scheduled to stop receiving fixes from the vendor on 2026-11-12.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Scheduled end of life |
| Severity | low |
| Ecosystem | `container` |
| Component | `pkg:docker/library/postgres` |
| Affected versions | `vers:semver/>=14.0.0\|<15.0.0` |
| Date from the source | 2026-11-12 |
| Replacement | A postgres image on a later supported major version (the upgrade needs a dump/restore or pg_upgrade) |
| Evidence last seen | 2026-10-24 |
| Reviewed | 2026-10-24 by arminazimi, drafted by the `endoflife-date` importer |
| Review due | 2027-10-24 (365 days after the last review) |
| Rule ID | `container.postgres.eol-14-and-older` |

## Sources

- [PostgreSQL release policy (vendor)](https://www.postgresql.org/support/versioning/)

## Migration

**Constraints**

- A major PostgreSQL upgrade does not reuse the old data directory: the data must be dumped and restored, or migrated with pg_upgrade, before the new image can start on it.
- Check extensions, client libraries, and any init scripts against the target major version, and take a backup first.

**Steps**

1. **Update the base image.** Change the reported FROM line or Compose image to a tag on a supported release line, and pin it to a digest if your policy requires.
2. **Align other image references.** Update other Dockerfiles, Compose files, CI service containers, and deployment manifests that use the same image so they agree.

**Verification**

- `docker compose config`: Validate the Compose file after changing the image tag.
- `docker compose run --rm db postgres --version`: Confirm the database container runs the intended major version (service name may differ).

## Detected by

The [`container`](../detectors/container.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/container.json`](https://github.com/arminazimi/evergreen/blob/main/registry/container.json), rule `container.postgres.eol-14-and-older`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/container.postgres.eol-14-and-older.html",
  "url": "https://arminazimi.github.io/evergreen/rules/container.postgres.eol-14-and-older.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/container.postgres.eol-14-and-older.html",
  "headline": "PostgreSQL image release line 14 reaches end-of-life on 2026-11-12 — dates, impact, migration",
  "description": "The PostgreSQL 14 release line is scheduled to stop receiving fixes from the vendor on 2026-11-12.",
  "inLanguage": "en",
  "dateModified": "2026-10-24",
  "keywords": [
    "scheduled-end-of-life",
    "container",
    "low"
  ],
  "about": {
    "@type": "Thing",
    "name": "PostgreSQL image release line 14 reaches end-of-life on 2026-11-12",
    "identifier": "pkg:docker/library/postgres"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "PostgreSQL release policy (vendor)",
      "url": "https://www.postgresql.org/support/versioning/"
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
