---
title: "PostgreSQL image major versions 13 and older are end-of-life"
description: "The PostgreSQL project no longer releases fixes for these major versions."
---

# PostgreSQL image major versions 13 and older are end-of-life

The PostgreSQL project no longer releases fixes for these major versions.

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `container` |
| Component | `pkg:docker/library/postgres` |
| Affected versions | `vers:semver/<14.0.0` |
| Date from the source | 2025-11-13 |
| Replacement | A postgres image on a supported major version (the upgrade needs a dump/restore or pg_upgrade) |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `container.postgres.eol-13-and-older` |

## Sources

- [PostgreSQL versioning policy](https://www.postgresql.org/support/versioning/)

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

This page is generated from [`registry/container.json`](https://github.com/arminazimi/evergreen/blob/main/registry/container.json), rule `container.postgres.eol-13-and-older`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
