---
title: "Drupal image release lines 10.5 and older are end-of-life — dates, impact, migration"
description: "These Drupal release lines no longer receive security fixes from the vendor: the core release schedule ends security support for 10.5 when 11.4 is released, in the week of 2026-06-29, and lists 10.6…"
canonical_url: "https://arminazimi.github.io/evergreen/rules/container.drupal.eol-10.5-and-older.html"
json_twin: "/rules/container.drupal.eol-10.5-and-older.json"
---

# Drupal image release lines 10.5 and older are end-of-life

**End of life** as of 2026-07-01. Replacement: A drupal image on a supported release line. Source: [Drupal release policy (vendor)](https://www.drupal.org/about/core/policies/core-release-cycles/schedule).

Check a version:

```bash
evergreen check pkg:docker/library/drupal
```

These Drupal release lines no longer receive security fixes from the vendor: the core release schedule ends security support for 10.5 when 11.4 is released, in the week of 2026-06-29, and lists 10.6 as the only supported minor of Drupal 10.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `container` |
| Component | `pkg:docker/library/drupal` |
| Affected versions | `vers:semver/<10.6.0` |
| Date from the source | 2026-07-01 |
| Replacement | A drupal image on a supported release line |
| Evidence last seen | 2026-10-20 |
| Reviewed | 2026-10-20 by arminazimi, drafted by the `endoflife-date` importer |
| Review due | 2027-10-20 (365 days after the last review) |
| Rule ID | `container.drupal.eol-10.5-and-older` |

## Sources

- [Drupal release policy (vendor)](https://www.drupal.org/about/core/policies/core-release-cycles/schedule)

## Migration

**Constraints**

- Keep the base image, Compose image, CI service containers, and deployment manifests that use drupal on one supported Drupal release line.
- Confirm the application and its data or configuration work on the target Drupal release; read the vendor's upgrade notes before moving across several release lines.

**Steps**

1. **Update the base image.** Change the reported FROM line or Compose image to a tag on a supported release line, and pin it to a digest if your policy requires.
2. **Align other image references.** Update other Dockerfiles, Compose files, CI service containers, and deployment manifests that use the same image so they agree.

**Verification**

- `docker build .`: Build the image on the new base.
- `docker run --rm IMAGE sh -c 'echo ok'`: Confirm the container starts on the new base.

## Detected by

The [`container`](../detectors/container.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/container.json`](https://github.com/arminazimi/evergreen/blob/main/registry/container.json), rule `container.drupal.eol-10.5-and-older`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/container.drupal.eol-10.5-and-older.html",
  "url": "https://arminazimi.github.io/evergreen/rules/container.drupal.eol-10.5-and-older.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/container.drupal.eol-10.5-and-older.html",
  "headline": "Drupal image release lines 10.5 and older are end-of-life — dates, impact, migration",
  "description": "These Drupal release lines no longer receive security fixes from the vendor: the core release schedule ends security support for 10.5 when 11.4 is released, in the week of 2026-06-29, and lists 10.6…",
  "inLanguage": "en",
  "dateModified": "2026-10-20",
  "keywords": [
    "end-of-life",
    "container",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Drupal image release lines 10.5 and older are end-of-life",
    "identifier": "pkg:docker/library/drupal"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Drupal release policy (vendor)",
      "url": "https://www.drupal.org/about/core/policies/core-release-cycles/schedule"
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
