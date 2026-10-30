---
title: "Scala 2.11 reached end of life — dates, impact, migration"
description: "The Scala project's development guarantees page states that Scala 2.11 reached end-of-life in 2016. It remains available in some contexts, but it is no longer maintained."
canonical_url: "https://arminazimi.github.io/evergreen/rules/scala.runtime.eol-2.11.html"
json_twin: "/rules/scala.runtime.eol-2.11.json"
---

# Scala 2.11 reached end of life

The Scala project's development guarantees page states that Scala 2.11 reached end-of-life in 2016. It remains available in some contexts, but it is no longer maintained.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `scala` |
| Component | `pkg:generic/scala` |
| Affected versions | `vers:semver/>=2.11.0\|<2.12.0` |
| Date from the source | 2016-01-01 |
| Replacement | Scala 2.13 or Scala 3 |
| Evidence last seen | 2026-10-27 |
| Reviewed | 2026-10-27 by arminazimi |
| Review due | 2027-01-25 (90 days after the last review) |
| Rule ID | `scala.runtime.eol-2.11` |

## Sources

- [Scala development guarantees — Scala 2.11 status](https://scala-lang.org/development/)
- [Scala 2 maintenance plans](https://www.scala-lang.org/blog/2024/12/16/scala-2-maintenance.html)

## Migration

**Constraints**

- Keep .scala-version, build.sbt scalaVersion, CI setup-java / setup-scala versions, and container images on one supported Scala release line.
- Confirm libraryDependencies cross-build or resolve on the target Scala and re-resolve with sbt after changing the runtime.

**Steps**

1. **Raise the Scala version.** Change the reported declaration from Scala 2.11 to a supported release (see the replacement), using the project's existing version manager or sbt setting.
2. **Align other Scala version surfaces.** Update .scala-version, build.sbt scalaVersion, CI matrices, and Dockerfile Scala images so they agree.

**Verification**

- `scala -version`: Confirm the active Scala runtime is the intended release.
- `sbt -Dsbt.supershell=false compile`: Compile the project on the new Scala.
- `sbt -Dsbt.supershell=false test`: Run the sbt test suite on the new Scala.

## Detected by

The `scala` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/scala.json`](https://github.com/arminazimi/evergreen/blob/main/registry/scala.json), rule `scala.runtime.eol-2.11`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/scala.runtime.eol-2.11.html",
  "url": "https://arminazimi.github.io/evergreen/rules/scala.runtime.eol-2.11.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/scala.runtime.eol-2.11.html",
  "headline": "Scala 2.11 reached end of life — dates, impact, migration",
  "description": "The Scala project's development guarantees page states that Scala 2.11 reached end-of-life in 2016. It remains available in some contexts, but it is no longer maintained.",
  "inLanguage": "en",
  "dateModified": "2026-10-27",
  "keywords": [
    "end-of-life",
    "scala",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Scala 2.11 reached end of life",
    "identifier": "pkg:generic/scala"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Scala development guarantees — Scala 2.11 status",
      "url": "https://scala-lang.org/development/"
    },
    {
      "@type": "CreativeWork",
      "name": "Scala 2 maintenance plans",
      "url": "https://www.scala-lang.org/blog/2024/12/16/scala-2-maintenance.html"
    }
  ],
  "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/scala.json",
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen"
  }
}
</script>
