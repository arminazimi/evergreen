---
title: "Debian image release lines 11 and older are end-of-life — dates, impact, migration"
description: "These Debian releases no longer receive LTS security updates from the vendor."
canonical_url: "https://arminazimi.github.io/evergreen/rules/container.debian.eol-11-and-older.html"
---

# Debian image release lines 11 and older are end-of-life

These Debian releases no longer receive LTS security updates from the vendor.

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

## Data

This page is generated from [`registry/container.json`](https://github.com/arminazimi/evergreen/blob/main/registry/container.json), rule `container.debian.eol-11-and-older`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
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
}
</script>
