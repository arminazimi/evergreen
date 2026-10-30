---
title: "Spring Boot 2.x is out of open-source support — dates, impact, migration"
description: "Spring Boot 2.x no longer receives regular open-source releases. Spring Boot 2.7 had an extended commercial support period, which is distinct from community OSS support."
canonical_url: "https://arminazimi.github.io/evergreen/rules/java.maven.spring-boot.legacy-2x.end-of-support.html"
json_twin: "/rules/java.maven.spring-boot.legacy-2x.end-of-support.json"
---

# Spring Boot 2.x is out of open-source support

**End of support.** The source gives no day. Replacement: Spring Boot 4.1.x. Source: [Spring Boot support policy](https://spring.io/projects/spring-boot#support).

Check a version:

```bash
evergreen check pkg:maven/org.springframework.boot/spring-boot
```

Spring Boot 2.x no longer receives regular open-source releases. Spring Boot 2.7 had an extended commercial support period, which is distinct from community OSS support. Upgrade to a supported Spring Boot 4.x line and follow the 2.x-to-3.x and 3.x-to-4.x migration guidance.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `java` |
| Component | `pkg:maven/org.springframework.boot/spring-boot` |
| Affected versions | `vers:maven/>=2.0.0\|<3.0.0` |
| Date from the source | The source gives no day |
| Replacement | Spring Boot 4.1.x |
| Evidence last seen | 2026-10-25 |
| Reviewed | 2026-10-25 by Aaqibhafeezkhan |
| Review due | 2027-04-23 (180 days after the last review) |
| Rule ID | `java.maven.spring-boot.legacy-2x.end-of-support` |

## Sources

- [Spring Boot support policy](https://spring.io/projects/spring-boot#support)

## Migration

**Constraints**

- Spring Boot 2.7's extended commercial support does not mean the 2.x line remains in community open-source support.
- Spring Boot 3 requires Java 17 or later and includes the Jakarta EE namespace migration; complete the 2.x-to-3.x changes before moving to 4.x.

**Steps**

1. **Upgrade to a supported 3.x baseline first.** Follow the official Spring Boot 3 migration guide, move to Java 17 or later, and migrate Java EE javax APIs to their Jakarta equivalents where required.
2. **Move to a supported 4.x release.** Follow the Spring Boot 4 migration guide, align Spring Framework and managed dependencies, and remove configuration deprecated by the intermediate releases.

**Verification**

- `./mvnw -B verify || ./gradlew build`: Build and run the project's tests after the upgrade.
- `./mvnw -B dependency:tree || ./gradlew dependencies`: Check that the resolved dependency graph uses a consistent supported Spring Boot line.

## Detected by

The [`java`](../detectors/java.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Other versions of this product

- [Spring Boot 1.x is out of open-source support](java.maven.spring-boot.legacy-1x.end-of-support.html)
- [Spring Boot 3.x is out of open-source support](java.maven.spring-boot.legacy-3x.end-of-support.html)

### Same ecosystem

- [Java 12 to 16 are no longer supported](java.jdk.end-of-support-12-16.html)
- [Java 18 to 20 are no longer supported](java.jdk.end-of-support-18-20.html)
- [Java 22 to 24 are no longer supported](java.jdk.end-of-support-22-24.html)
- [Java 26 is no longer supported](java.jdk.end-of-support-26.html)
- [Java 9 and 10 are no longer supported](java.jdk.end-of-support-9-10.html)
- [mysql:mysql-connector-java has moved to com.mysql:mysql-connector-j](java.maven.mysql.mysql-connector-java.relocated.html)
- [org.hibernate:hibernate-entitymanager has moved to org.hibernate.orm:hibernate-entitymanager](java.maven.org.hibernate.hibernate-entitymanager.relocated.html)
- [org.slf4j:slf4j-log4j12 has moved to org.slf4j:slf4j-reload4j](java.maven.org.slf4j.slf4j-log4j12.relocated.html)


## Data

This page is generated from [`registry/java.json`](https://github.com/arminazimi/evergreen/blob/main/registry/java.json), rule `java.maven.spring-boot.legacy-2x.end-of-support`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/java.maven.spring-boot.legacy-2x.end-of-support.html",
      "url": "https://arminazimi.github.io/evergreen/rules/java.maven.spring-boot.legacy-2x.end-of-support.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/java.maven.spring-boot.legacy-2x.end-of-support.html",
      "headline": "Spring Boot 2.x is out of open-source support — dates, impact, migration",
      "description": "Spring Boot 2.x no longer receives regular open-source releases. Spring Boot 2.7 had an extended commercial support period, which is distinct from community OSS support.",
      "inLanguage": "en",
      "dateModified": "2026-10-25",
      "keywords": [
        "end-of-support",
        "java",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "Spring Boot 2.x is out of open-source support",
        "identifier": "pkg:maven/org.springframework.boot/spring-boot"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Spring Boot support policy",
          "url": "https://spring.io/projects/spring-boot#support"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/java.maven.spring-boot.legacy-2x.end-of-support.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/java.maven.spring-boot.legacy-2x.end-of-support.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:maven/org.springframework.boot/spring-boot?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of support. The source gives no day. Affected versions: vers:maven/>=2.0.0|\u003c3.0.0. Source: Spring Boot support policy (https://spring.io/projects/spring-boot#support)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:maven/org.springframework.boot/spring-boot?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Spring Boot 4.1.x"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:maven/org.springframework.boot/spring-boot?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:maven/org.springframework.boot/spring-boot."
          }
        }
      ]
    }
  ]
}
</script>
