---
title: "Go image release lines 1.25 and older are end-of-life — dates, impact, migration"
description: "These Go release lines no longer receive fixes from the vendor."
canonical_url: "https://arminazimi.github.io/evergreen/rules/container.golang.eol-1.25-and-older.html"
json_twin: "/rules/container.golang.eol-1.25-and-older.json"
---

# Go image release lines 1.25 and older are end-of-life

**End of life** as of 2026-08-19. Replacement: A golang image on a supported release line. Source: [Go release policy (vendor)](https://go.dev/doc/devel/release#policy).

Check a version:

```bash
evergreen check pkg:docker/library/golang
```

These Go release lines no longer receive fixes from the vendor.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `container` |
| Component | `pkg:docker/library/golang` |
| Affected versions | `vers:semver/<1.26.0` |
| Date from the source | 2026-08-19 |
| Replacement | A golang image on a supported release line |
| Evidence last seen | 2026-10-20 |
| Reviewed | 2026-10-20 by arminazimi, drafted by the `endoflife-date` importer |
| Review due | 2027-10-20 (365 days after the last review) |
| Rule ID | `container.golang.eol-1.25-and-older` |

## Sources

- [Go release policy (vendor)](https://go.dev/doc/devel/release#policy)

## Migration

**Constraints**

- Keep the base image, Compose image, CI service containers, and deployment manifests that use golang on one supported Go release line.
- Confirm the application and its data or configuration work on the target Go release; read the vendor's upgrade notes before moving across several release lines.

**Steps**

1. **Update the base image.** Change the reported FROM line or Compose image to a tag on a supported release line, and pin it to a digest if your policy requires.
2. **Align other image references.** Update other Dockerfiles, Compose files, CI service containers, and deployment manifests that use the same image so they agree.

**Verification**

- `docker build .`: Build the image on the new base.
- `docker run --rm IMAGE sh -c 'echo ok'`: Confirm the container starts on the new base.

## Detected by

The [`container`](../detectors/container.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/container.json`](https://github.com/arminazimi/evergreen/blob/main/registry/container.json), rule `container.golang.eol-1.25-and-older`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/container.golang.eol-1.25-and-older.html",
  "url": "https://arminazimi.github.io/evergreen/rules/container.golang.eol-1.25-and-older.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/container.golang.eol-1.25-and-older.html",
  "headline": "Go image release lines 1.25 and older are end-of-life — dates, impact, migration",
  "description": "These Go release lines no longer receive fixes from the vendor.",
  "inLanguage": "en",
  "dateModified": "2026-10-20",
  "keywords": [
    "end-of-life",
    "container",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Go image release lines 1.25 and older are end-of-life",
    "identifier": "pkg:docker/library/golang"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Go release policy (vendor)",
      "url": "https://go.dev/doc/devel/release#policy"
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
