---
title: "Alpine Linux image release line 3.18 reaches end-of-life on 2025-05-09 — dates, impact, migration"
description: "Alpine Linux 3.18 is scheduled to stop receiving security updates on 2025-05-09."
canonical_url: "https://arminazimi.github.io/evergreen/rules/container.alpine.eol-3.18.html"
---

# Alpine Linux image release line 3.18 reaches end-of-life on 2025-05-09

Alpine Linux 3.18 is scheduled to stop receiving security updates on 2025-05-09.

| | |
| --- | --- |
| Status | Scheduled end of life |
| Severity | low |
| Ecosystem | `container` |
| Component | `pkg:docker/library/alpine` |
| Affected versions | `vers:semver/>=3.18.0\|<3.19.0` |
| Date from the source | 2025-05-09 |
| Replacement | An alpine image on a later supported release line |
| Evidence last seen | 2025-02-18 |
| Reviewed | 2025-02-18 by agent |
| Review due | 2026-02-18 (365 days after the last review) |
| Rule ID | `container.alpine.eol-3.18` |

## Sources

- [Alpine Linux releases](https://alpinelinux.org/releases/)

## Migration

**Constraints**

- Keep the base image and deployment manifests that use alpine on one supported Alpine release line.
- Confirm the application and its dependencies work on the target Alpine release.

**Steps**

1. **Update the base image.** Change the reported FROM line or Compose image to a tag on a supported release line, and pin it to a digest if your policy requires.
2. **Align other image references.** Update other Dockerfiles, Compose files, CI service containers, and deployment manifests that use the same image so they agree.

**Verification**

- `docker build .`: Build the image on the new base.
- `docker run --rm IMAGE sh -c 'echo ok'`: Confirm the container starts on the new base.

## Detected by

The [`container`](../detectors/container.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/container.json`](https://github.com/arminazimi/evergreen/blob/main/registry/container.json), rule `container.alpine.eol-3.18`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/container.alpine.eol-3.18.html",
  "url": "https://arminazimi.github.io/evergreen/rules/container.alpine.eol-3.18.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/container.alpine.eol-3.18.html",
  "headline": "Alpine Linux image release line 3.18 reaches end-of-life on 2025-05-09 — dates, impact, migration",
  "description": "Alpine Linux 3.18 is scheduled to stop receiving security updates on 2025-05-09.",
  "inLanguage": "en",
  "dateModified": "2025-02-18",
  "keywords": [
    "scheduled-end-of-life",
    "container",
    "low"
  ],
  "about": {
    "@type": "Thing",
    "name": "Alpine Linux image release line 3.18 reaches end-of-life on 2025-05-09",
    "identifier": "pkg:docker/library/alpine"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Alpine Linux releases",
      "url": "https://alpinelinux.org/releases/"
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
