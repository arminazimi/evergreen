---
title: "Python image release lines 3.10 and older are end-of-life"
description: "These Python release lines no longer receive security or bug fixes from the Python core team."
---

# Python image release lines 3.10 and older are end-of-life

These Python release lines no longer receive security or bug fixes from the Python core team.

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

## Data

This page is generated from [`registry/container.json`](https://github.com/arminazimi/evergreen/blob/main/registry/container.json), rule `container.python.eol-3.10-and-older`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
