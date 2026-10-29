---
title: "org.hibernate:hibernate-entitymanager has moved to org.hibernate.orm:hibernate-entitymanager — dates, impact, migration"
description: "The POM of org.hibernate:hibernate-entitymanager 6.0.0.Alpha7 declares a relocation to org.hibernate.orm:hibernate-entitymanager."
canonical_url: "https://arminazimi.github.io/evergreen/rules/java.maven.org.hibernate.hibernate-entitymanager.relocated.html"
---

# org.hibernate:hibernate-entitymanager has moved to org.hibernate.orm:hibernate-entitymanager

The POM of org.hibernate:hibernate-entitymanager 6.0.0.Alpha7 declares a relocation to org.hibernate.orm:hibernate-entitymanager.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `java` |
| Component | `pkg:maven/org.hibernate/hibernate-entitymanager` |
| Affected versions | `vers:maven/>=6.0.0.Alpha3` |
| Date from the source | The source gives no day |
| Replacement | org.hibernate.orm:hibernate-entitymanager |
| Evidence last seen | 2026-10-20 |
| Reviewed | 2026-10-20 by arminazimi, drafted by the `java-2` importer |
| Review due | 2027-04-18 (180 days after the last review) |
| Rule ID | `java.maven.org.hibernate.hibernate-entitymanager.relocated` |

## Sources

- [org.hibernate:hibernate-entitymanager 6.0.0.Alpha7 POM on Maven Central](https://repo1.maven.org/maven2/org/hibernate/hibernate-entitymanager/6.0.0.Alpha7/hibernate-entitymanager-6.0.0.Alpha7.pom)

## Migration

**Constraints**

- Replace org.hibernate:hibernate-entitymanager with org.hibernate.orm:hibernate-entitymanager; the relocation in the artifact's POM names the new coordinates, so keep the version unless you intend to upgrade it.
- Update every module and dependency-management block that names the old coordinates, and remove exclusions that mention them.

**Steps**

1. **Change the dependency coordinates.** Replace the reported `org.hibernate:hibernate-entitymanager` dependency with `org.hibernate.orm:hibernate-entitymanager`.
2. **Align other declarations.** Update every other pom.xml, Gradle build file, version catalog, and BOM override that names the old coordinates.

**Verification**

- `./mvnw -B dependency:tree || ./gradlew dependencies`: Confirm the old coordinates are gone from the resolved dependency graph.
- `./mvnw -B verify || ./gradlew build`: Build and test the project with the new coordinates.

## Detected by

The [`java`](../detectors/java.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/java.json`](https://github.com/arminazimi/evergreen/blob/main/registry/java.json), rule `java.maven.org.hibernate.hibernate-entitymanager.relocated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/java.maven.org.hibernate.hibernate-entitymanager.relocated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/java.maven.org.hibernate.hibernate-entitymanager.relocated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/java.maven.org.hibernate.hibernate-entitymanager.relocated.html",
  "headline": "org.hibernate:hibernate-entitymanager has moved to org.hibernate.orm:hibernate-entitymanager — dates, impact, migration",
  "description": "The POM of org.hibernate:hibernate-entitymanager 6.0.0.Alpha7 declares a relocation to org.hibernate.orm:hibernate-entitymanager.",
  "inLanguage": "en",
  "dateModified": "2026-10-20",
  "keywords": [
    "deprecated",
    "java",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "org.hibernate:hibernate-entitymanager has moved to org.hibernate.orm:hibernate-entitymanager",
    "identifier": "pkg:maven/org.hibernate/hibernate-entitymanager"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "org.hibernate:hibernate-entitymanager 6.0.0.Alpha7 POM on Maven Central",
      "url": "https://repo1.maven.org/maven2/org/hibernate/hibernate-entitymanager/6.0.0.Alpha7/hibernate-entitymanager-6.0.0.Alpha7.pom"
    }
  ],
  "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/java.json",
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen"
  }
}
</script>
