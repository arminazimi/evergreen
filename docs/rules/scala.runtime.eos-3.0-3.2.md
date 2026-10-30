---
title: "Scala 3.0–3.2 no longer receive patches — dates, impact, migration"
description: "The Scala project's development guarantees page states that a non-LTS Scala 3 minor receives patches only until the next minor ships."
canonical_url: "https://arminazimi.github.io/evergreen/rules/scala.runtime.eos-3.0-3.2.html"
json_twin: "/rules/scala.runtime.eos-3.0-3.2.json"
---

# Scala 3.0–3.2 no longer receive patches

The Scala project's development guarantees page states that a non-LTS Scala 3 minor receives patches only until the next minor ships. Scala 3.0, 3.1, and 3.2 are frozen on their last patches; later fixes landed only in 3.3 LTS and newer lines.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `scala` |
| Component | `pkg:generic/scala` |
| Affected versions | `vers:semver/>=3.0.0\|<3.3.0` |
| Date from the source | The source gives no day |
| Replacement | Scala 3.3 LTS or a current Scala Next / LTS line |
| Evidence last seen | 2026-10-27 |
| Reviewed | 2026-10-27 by arminazimi |
| Review due | 2027-01-25 (90 days after the last review) |
| Rule ID | `scala.runtime.eos-3.0-3.2` |

## Sources

- [Scala development guarantees — Scala 3 LTS](https://scala-lang.org/development/)
- [Scala 3.9 LTS released](https://scala-lang.org/news/3.9/)

## Migration

**Constraints**

- Keep .scala-version, build.sbt scalaVersion, CI matrices, and container images on one supported Scala 3 LTS or Next line.
- Confirm dependencies publish for the target Scala 3 line and re-resolve with sbt after changing the runtime.

**Steps**

1. **Raise the Scala version.** Change the reported declaration from Scala 3.0–3.2 to a supported release (see the replacement).
2. **Align other Scala version surfaces.** Update .scala-version, build.sbt scalaVersion, CI matrices, and Dockerfile Scala images so they agree.

**Verification**

- `scala -version`: Confirm the active Scala runtime is the intended release.
- `sbt -Dsbt.supershell=false compile`: Compile the project on the new Scala.
- `sbt -Dsbt.supershell=false test`: Run the sbt test suite on the new Scala.

## Detected by

The `scala` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/scala.json`](https://github.com/arminazimi/evergreen/blob/main/registry/scala.json), rule `scala.runtime.eos-3.0-3.2`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/scala.runtime.eos-3.0-3.2.html",
  "url": "https://arminazimi.github.io/evergreen/rules/scala.runtime.eos-3.0-3.2.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/scala.runtime.eos-3.0-3.2.html",
  "headline": "Scala 3.0–3.2 no longer receive patches — dates, impact, migration",
  "description": "The Scala project's development guarantees page states that a non-LTS Scala 3 minor receives patches only until the next minor ships.",
  "inLanguage": "en",
  "dateModified": "2026-10-27",
  "keywords": [
    "end-of-support",
    "scala",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Scala 3.0–3.2 no longer receive patches",
    "identifier": "pkg:generic/scala"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Scala development guarantees — Scala 3 LTS",
      "url": "https://scala-lang.org/development/"
    },
    {
      "@type": "CreativeWork",
      "name": "Scala 3.9 LTS released",
      "url": "https://scala-lang.org/news/3.9/"
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
