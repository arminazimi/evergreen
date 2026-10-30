---
title: "Node.js image release line 22 reaches end-of-life on 2027-04-30 — dates, impact, migration"
description: "Node.js 22 is scheduled to stop receiving security and bug fixes on 2027-04-30, so images tagged with it will then be built on an unsupported runtime."
canonical_url: "https://arminazimi.github.io/evergreen/rules/container.node.eol-22-and-older.html"
---

# Node.js image release line 22 reaches end-of-life on 2027-04-30

**Scheduled end of life** as of 2027-04-30. Replacement: A node image on a later supported release line, such as node:24. Source: [Node.js end-of-life releases](https://nodejs.org/en/about/eol).

Check a version:

```bash
evergreen check pkg:docker/library/node
```

Node.js 22 is scheduled to stop receiving security and bug fixes on 2027-04-30, so images tagged with it will then be built on an unsupported runtime.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Scheduled end of life |
| Severity | low |
| Ecosystem | `container` |
| Component | `pkg:docker/library/node` |
| Affected versions | `vers:semver/>=22.0.0\|<23.0.0` |
| Date from the source | 2027-04-30 |
| Replacement | A node image on a later supported release line, such as node:24 |
| Evidence last seen | 2026-10-24 |
| Reviewed | 2026-10-24 by arminazimi, drafted by the `container-official-images` importer |
| Review due | 2027-10-24 (365 days after the last review) |
| Rule ID | `container.node.eol-22-and-older` |

## Sources

- [Node.js end-of-life releases](https://nodejs.org/en/about/eol)
- [Node.js Release Working Group schedule](https://github.com/nodejs/Release/blob/main/schedule.json)

## Migration

**Constraints**

- Keep the Dockerfile base image, Compose image, CI service containers, and the engines field in package.json on one supported Node.js release line.
- Confirm native modules and production dependencies support the target Node.js major.

**Steps**

1. **Update the base image.** Change the reported FROM line or Compose image to a tag on a supported release line, and pin it to a digest if your policy requires.
2. **Align other image references.** Update other Dockerfiles, Compose files, CI service containers, and deployment manifests that use the same image so they agree.

**Verification**

- `docker build .`: Build the image on the new base.
- `docker run --rm IMAGE node --version`: Confirm the container runs the intended Node.js version.

## Detected by

The [`container`](../detectors/container.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/container.json`](https://github.com/arminazimi/evergreen/blob/main/registry/container.json), rule `container.node.eol-22-and-older`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/container.node.eol-22-and-older.html",
  "url": "https://arminazimi.github.io/evergreen/rules/container.node.eol-22-and-older.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/container.node.eol-22-and-older.html",
  "headline": "Node.js image release line 22 reaches end-of-life on 2027-04-30 — dates, impact, migration",
  "description": "Node.js 22 is scheduled to stop receiving security and bug fixes on 2027-04-30, so images tagged with it will then be built on an unsupported runtime.",
  "inLanguage": "en",
  "dateModified": "2026-10-24",
  "keywords": [
    "scheduled-end-of-life",
    "container",
    "low"
  ],
  "about": {
    "@type": "Thing",
    "name": "Node.js image release line 22 reaches end-of-life on 2027-04-30",
    "identifier": "pkg:docker/library/node"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Node.js end-of-life releases",
      "url": "https://nodejs.org/en/about/eol"
    },
    {
      "@type": "CreativeWork",
      "name": "Node.js Release Working Group schedule",
      "url": "https://github.com/nodejs/Release/blob/main/schedule.json"
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
