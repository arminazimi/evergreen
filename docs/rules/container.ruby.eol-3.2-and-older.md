---
title: "Ruby image release lines 3.2 and older are end-of-life — dates, impact, migration"
description: "These Ruby branches no longer receive security or bug fixes."
canonical_url: "https://arminazimi.github.io/evergreen/rules/container.ruby.eol-3.2-and-older.html"
---

# Ruby image release lines 3.2 and older are end-of-life

These Ruby branches no longer receive security or bug fixes.

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `container` |
| Component | `pkg:docker/library/ruby` |
| Affected versions | `vers:semver/<3.3.0` |
| Date from the source | 2026-04-01 |
| Replacement | A ruby image on a supported branch |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `container.ruby.eol-3.2-and-older` |

## Sources

- [Ruby maintenance branches](https://www.ruby-lang.org/en/downloads/branches/)

## Migration

**Constraints**

- Keep the base image, .ruby-version, Gemfile ruby requirement, and CI matrices on one supported Ruby branch.
- Confirm gems with native extensions build on the target Ruby, and rebuild bundled gems inside the image.

**Steps**

1. **Update the base image.** Change the reported FROM line or Compose image to a tag on a supported release line, and pin it to a digest if your policy requires.
2. **Align other image references.** Update other Dockerfiles, Compose files, CI service containers, and deployment manifests that use the same image so they agree.

**Verification**

- `docker build .`: Build the image on the new base.
- `docker run --rm IMAGE ruby --version`: Confirm the container runs the intended Ruby version.

## Detected by

The [`container`](../detectors/container.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/container.json`](https://github.com/arminazimi/evergreen/blob/main/registry/container.json), rule `container.ruby.eol-3.2-and-older`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/container.ruby.eol-3.2-and-older.html",
  "url": "https://arminazimi.github.io/evergreen/rules/container.ruby.eol-3.2-and-older.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/container.ruby.eol-3.2-and-older.html",
  "headline": "Ruby image release lines 3.2 and older are end-of-life — dates, impact, migration",
  "description": "These Ruby branches no longer receive security or bug fixes.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "end-of-life",
    "container",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Ruby image release lines 3.2 and older are end-of-life",
    "identifier": "pkg:docker/library/ruby"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Ruby maintenance branches",
      "url": "https://www.ruby-lang.org/en/downloads/branches/"
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
