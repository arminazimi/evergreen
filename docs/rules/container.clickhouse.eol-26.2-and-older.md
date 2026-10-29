---
title: "ClickHouse image release lines 26.2 and older are end-of-life — dates, impact, migration"
description: "These ClickHouse release lines are listed as not supported with security updates in the vendor's security policy; 26.3 is the oldest line it still supports."
canonical_url: "https://arminazimi.github.io/evergreen/rules/container.clickhouse.eol-26.2-and-older.html"
---

# ClickHouse image release lines 26.2 and older are end-of-life

These ClickHouse release lines are listed as not supported with security updates in the vendor's security policy; 26.3 is the oldest line it still supports.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `container` |
| Component | `pkg:docker/library/clickhouse` |
| Affected versions | `vers:semver/<26.3.0` |
| Date from the source | The source gives no day |
| Replacement | A clickhouse image on a supported release line |
| Evidence last seen | 2026-10-20 |
| Reviewed | 2026-10-20 by arminazimi, drafted by the `endoflife-date` importer |
| Review due | 2027-10-20 (365 days after the last review) |
| Rule ID | `container.clickhouse.eol-26.2-and-older` |

## Sources

- [ClickHouse security policy: supported versions](https://github.com/ClickHouse/ClickHouse/blob/master/SECURITY.md)

## Migration

**Constraints**

- Keep the base image, Compose image, CI service containers, and deployment manifests that use clickhouse on one supported ClickHouse release line.
- Confirm the application and its data or configuration work on the target ClickHouse release; read the vendor's upgrade notes before moving across several release lines.

**Steps**

1. **Update the base image.** Change the reported FROM line or Compose image to a tag on a supported release line, and pin it to a digest if your policy requires.
2. **Align other image references.** Update other Dockerfiles, Compose files, CI service containers, and deployment manifests that use the same image so they agree.

**Verification**

- `docker build .`: Build the image on the new base.
- `docker run --rm IMAGE sh -c 'echo ok'`: Confirm the container starts on the new base.

## Detected by

The [`container`](../detectors/container.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/container.json`](https://github.com/arminazimi/evergreen/blob/main/registry/container.json), rule `container.clickhouse.eol-26.2-and-older`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/container.clickhouse.eol-26.2-and-older.html",
  "url": "https://arminazimi.github.io/evergreen/rules/container.clickhouse.eol-26.2-and-older.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/container.clickhouse.eol-26.2-and-older.html",
  "headline": "ClickHouse image release lines 26.2 and older are end-of-life — dates, impact, migration",
  "description": "These ClickHouse release lines are listed as not supported with security updates in the vendor's security policy; 26.3 is the oldest line it still supports.",
  "inLanguage": "en",
  "dateModified": "2026-10-20",
  "keywords": [
    "end-of-life",
    "container",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "ClickHouse image release lines 26.2 and older are end-of-life",
    "identifier": "pkg:docker/library/clickhouse"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "ClickHouse security policy: supported versions",
      "url": "https://github.com/ClickHouse/ClickHouse/blob/master/SECURITY.md"
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
