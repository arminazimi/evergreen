---
title: "mysql:mysql-connector-java has moved to com.mysql:mysql-connector-j — dates, impact, migration"
description: "The POM of mysql:mysql-connector-java 8.0.33 declares a relocation to com.mysql:mysql-connector-j. Its message says: \"MySQL Connector/J artifacts moved to reverse-DNS compliant Maven 2+ coordinates.\""
canonical_url: "https://arminazimi.github.io/evergreen/rules/java.maven.mysql.mysql-connector-java.relocated.html"
image: "/assets/og/java.maven.mysql.mysql-connector-java.relocated.svg"
json_twin: "/rules/java.maven.mysql.mysql-connector-java.relocated.json"
---

# mysql:mysql-connector-java has moved to com.mysql:mysql-connector-j

**Deprecated.** The source gives no day. Replacement: com.mysql:mysql-connector-j. Source: [mysql:mysql-connector-java 8.0.33 POM on Maven Central](https://repo1.maven.org/maven2/mysql/mysql-connector-java/8.0.33/mysql-connector-java-8.0.33.pom).

Check a version:

```bash
evergreen check pkg:maven/mysql/mysql-connector-java
```

The POM of mysql:mysql-connector-java 8.0.33 declares a relocation to com.mysql:mysql-connector-j. Its message says: "MySQL Connector/J artifacts moved to reverse-DNS compliant Maven 2+ coordinates."

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `java` |
| Component | `pkg:maven/mysql/mysql-connector-java` |
| Affected versions | `vers:maven/>=8.0.31` |
| Date from the source | The source gives no day |
| Replacement | com.mysql:mysql-connector-j |
| Evidence last seen | 2026-10-17 |
| Reviewed | 2026-10-17 by arminazimi, drafted by the `java-2` importer |
| Review due | 2027-04-15 (180 days after the last review) |
| Rule ID | `java.maven.mysql.mysql-connector-java.relocated` |

## Sources

- [mysql:mysql-connector-java 8.0.33 POM on Maven Central](https://repo1.maven.org/maven2/mysql/mysql-connector-java/8.0.33/mysql-connector-java-8.0.33.pom)

## Migration

**Constraints**

- Replace mysql:mysql-connector-java with com.mysql:mysql-connector-j; the relocation in the artifact's POM names the new coordinates, so keep the version unless you intend to upgrade it.
- Update every module and dependency-management block that names the old coordinates, and remove exclusions that mention them.

**Steps**

1. **Change the dependency coordinates.** Replace the reported `mysql:mysql-connector-java` dependency with `com.mysql:mysql-connector-j`.
2. **Align other declarations.** Update every other pom.xml, Gradle build file, version catalog, and BOM override that names the old coordinates.

**Verification**

- `./mvnw -B dependency:tree || ./gradlew dependencies`: Confirm the old coordinates are gone from the resolved dependency graph.
- `./mvnw -B verify || ./gradlew build`: Build and test the project with the new coordinates.

## Detected by

The [`java`](../detectors/java.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/java.json`](https://github.com/arminazimi/evergreen/blob/main/registry/java.json), rule `java.maven.mysql.mysql-connector-java.relocated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/java.maven.mysql.mysql-connector-java.relocated.html",
      "url": "https://arminazimi.github.io/evergreen/rules/java.maven.mysql.mysql-connector-java.relocated.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/java.maven.mysql.mysql-connector-java.relocated.html",
      "headline": "mysql:mysql-connector-java has moved to com.mysql:mysql-connector-j — dates, impact, migration",
      "description": "The POM of mysql:mysql-connector-java 8.0.33 declares a relocation to com.mysql:mysql-connector-j. Its message says: \"MySQL Connector/J artifacts moved to reverse-DNS compliant Maven 2+ coordinates.\"",
      "inLanguage": "en",
      "dateModified": "2026-10-17",
      "keywords": [
        "deprecated",
        "java",
        "medium"
      ],
      "about": {
        "@type": "Thing",
        "name": "mysql:mysql-connector-java has moved to com.mysql:mysql-connector-j",
        "identifier": "pkg:maven/mysql/mysql-connector-java"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "mysql:mysql-connector-java 8.0.33 POM on Maven Central",
          "url": "https://repo1.maven.org/maven2/mysql/mysql-connector-java/8.0.33/mysql-connector-java-8.0.33.pom"
        }
      ],
      "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/java.json",
      "publisher": {
        "@type": "Organization",
        "name": "Evergreen",
        "url": "https://arminazimi.github.io/evergreen"
      }
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/java.maven.mysql.mysql-connector-java.relocated.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/java.maven.mysql.mysql-connector-java.relocated.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:maven/mysql/mysql-connector-java?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated. The source gives no day. Affected versions: vers:maven/>=8.0.31. Source: mysql:mysql-connector-java 8.0.33 POM on Maven Central (https://repo1.maven.org/maven2/mysql/mysql-connector-java/8.0.33/mysql-connector-java-8.0.33.pom)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:maven/mysql/mysql-connector-java?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "com.mysql:mysql-connector-j"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:maven/mysql/mysql-connector-java?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:maven/mysql/mysql-connector-java."
          }
        }
      ]
    }
  ]
}
</script>
