---
title: "Ubuntu image release line 22.04 reaches standard support end-of-life on 2027-06-01 — dates, impact, migration"
description: "Ubuntu 22.04 is scheduled to stop receiving standard security updates on 2027-06-01."
canonical_url: "https://arminazimi.github.io/evergreen/rules/container.ubuntu.eol-22.04.html"
json_twin: "/rules/container.ubuntu.eol-22.04.json"
---

# Ubuntu image release line 22.04 reaches standard support end-of-life on 2027-06-01

Ubuntu 22.04 is scheduled to stop receiving standard security updates on 2027-06-01.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Scheduled end of life |
| Severity | low |
| Ecosystem | `container` |
| Component | `pkg:docker/library/ubuntu` |
| Affected versions | `vers:semver/>=22.0.0\|<22.10.0` |
| Date from the source | 2027-06-01 |
| Replacement | An ubuntu image on a later supported release line |
| Evidence last seen | 2026-10-26 |
| Reviewed | 2026-10-26 by arminazimi |
| Review due | 2027-10-26 (365 days after the last review) |
| Rule ID | `container.ubuntu.eol-22.04` |

## Sources

- [Ubuntu release cycle](https://ubuntu.com/about/release-cycle)

## Migration

**Constraints**

- Keep the base image and deployment manifests that use ubuntu on one supported Ubuntu release line.
- Confirm the application and its dependencies work on the target Ubuntu release.

**Steps**

1. **Update the base image.** Change the reported FROM line or Compose image to a tag on a supported release line, and pin it to a digest if your policy requires.
2. **Align other image references.** Update other Dockerfiles, Compose files, CI service containers, and deployment manifests that use the same image so they agree.

**Verification**

- `docker build .`: Build the image on the new base.
- `docker run --rm IMAGE sh -c 'echo ok'`: Confirm the container starts on the new base.

## Detected by

The [`container`](../detectors/container.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/container.json`](https://github.com/arminazimi/evergreen/blob/main/registry/container.json), rule `container.ubuntu.eol-22.04`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/container.ubuntu.eol-22.04.html",
  "url": "https://arminazimi.github.io/evergreen/rules/container.ubuntu.eol-22.04.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/container.ubuntu.eol-22.04.html",
  "headline": "Ubuntu image release line 22.04 reaches standard support end-of-life on 2027-06-01 — dates, impact, migration",
  "description": "Ubuntu 22.04 is scheduled to stop receiving standard security updates on 2027-06-01.",
  "inLanguage": "en",
  "dateModified": "2026-10-26",
  "keywords": [
    "scheduled-end-of-life",
    "container",
    "low"
  ],
  "about": {
    "@type": "Thing",
    "name": "Ubuntu image release line 22.04 reaches standard support end-of-life on 2027-06-01",
    "identifier": "pkg:docker/library/ubuntu"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Ubuntu release cycle",
      "url": "https://ubuntu.com/about/release-cycle"
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
