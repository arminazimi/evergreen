---
title: "sbt 0.13 reached end of life — dates, impact, migration"
description: "The sbt download page lists the 0.13.x series as end of life on 2018-11-30 after five years. The final release in that line is 0.13.18."
canonical_url: "https://arminazimi.github.io/evergreen/rules/scala.sbt.eol-0.13.html"
---

# sbt 0.13 reached end of life

**End of life** as of 2018-11-30. Replacement: sbt 1.x or sbt 2.x. Source: [sbt download — release timeline](https://www.scala-sbt.org/download/).

Check a version:

```bash
evergreen check pkg:generic/sbt
```

The sbt download page lists the 0.13.x series as end of life on 2018-11-30 after five years. The final release in that line is 0.13.18.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `scala` |
| Component | `pkg:generic/sbt` |
| Affected versions | `vers:semver/>=0.13.0\|<1.0.0` |
| Date from the source | 2018-11-30 |
| Replacement | sbt 1.x or sbt 2.x |
| Evidence last seen | 2026-10-27 |
| Reviewed | 2026-10-27 by arminazimi |
| Review due | 2027-01-25 (90 days after the last review) |
| Rule ID | `scala.sbt.eol-0.13` |

## Sources

- [sbt download — release timeline](https://www.scala-sbt.org/download/)
- [Migrating from sbt 0.13.x](https://www.scala-sbt.org/1.x/docs/Migrating-from-sbt-013x.html)

## Migration

**Constraints**

- Keep project/build.properties sbt.version, the installed sbt launcher, and CI sbt setup on one supported sbt major.
- Migrate build definitions away from 0.13-only syntax before raising sbt.version; see the migration guide.

**Steps**

1. **Raise the sbt version.** Change project/build.properties sbt.version from 0.13.x to a supported release (see the replacement).
2. **Migrate the build definition.** Apply the sbt 0.13 → 1.x migration guide for operators, Build.scala layouts, and plugins, then re-resolve plugins.

**Verification**

- `sbt -Dsbt.supershell=false sbtVersion`: Confirm the active sbt version is the intended release.
- `sbt -Dsbt.supershell=false compile`: Compile the project on the new sbt.
- `sbt -Dsbt.supershell=false test`: Run the sbt test suite on the new sbt.

## Detected by

The `scala` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/scala.json`](https://github.com/arminazimi/evergreen/blob/main/registry/scala.json), rule `scala.sbt.eol-0.13`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/scala.sbt.eol-0.13.html",
  "url": "https://arminazimi.github.io/evergreen/rules/scala.sbt.eol-0.13.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/scala.sbt.eol-0.13.html",
  "headline": "sbt 0.13 reached end of life — dates, impact, migration",
  "description": "The sbt download page lists the 0.13.x series as end of life on 2018-11-30 after five years. The final release in that line is 0.13.18.",
  "inLanguage": "en",
  "dateModified": "2026-10-27",
  "keywords": [
    "end-of-life",
    "scala",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "sbt 0.13 reached end of life",
    "identifier": "pkg:generic/sbt"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "sbt download — release timeline",
      "url": "https://www.scala-sbt.org/download/"
    },
    {
      "@type": "CreativeWork",
      "name": "Migrating from sbt 0.13.x",
      "url": "https://www.scala-sbt.org/1.x/docs/Migrating-from-sbt-013x.html"
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
