---
title: "Spring Boot 3.x is out of open-source support — dates, impact, migration"
description: "Spring Boot 3.x has reached the end of its open-source support lifecycle. The 3.3.x and 3.4.x lines were explicitly marked as the end of OSS support, and 3.5.16 was announced as the last OSS release…"
canonical_url: "https://arminazimi.github.io/evergreen/rules/java.maven.spring-boot.legacy-3x.end-of-support.html"
json_twin: "/rules/java.maven.spring-boot.legacy-3x.end-of-support.json"
---

# Spring Boot 3.x is out of open-source support

Spring Boot 3.x has reached the end of its open-source support lifecycle. The 3.3.x and 3.4.x lines were explicitly marked as the end of OSS support, and 3.5.16 was announced as the last OSS release of the 3.5.x generation. Commercial support may be available separately. Upgrade to a supported 4.x line.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `java` |
| Component | `pkg:maven/org.springframework.boot/spring-boot` |
| Affected versions | `vers:maven/>=3.0.0\|<4.0.0` |
| Date from the source | The source gives no day |
| Replacement | Spring Boot 4.1.x |
| Evidence last seen | 2026-10-25 |
| Reviewed | 2026-10-25 by Aaqibhafeezkhan |
| Review due | 2027-04-23 (180 days after the last review) |
| Rule ID | `java.maven.spring-boot.legacy-3x.end-of-support` |

## Sources

- [Spring Boot 3.3.13 — end of open-source support](https://spring.io/blog/2025/06/19/spring-boot-3-3-13-available-now/)
- [Spring Boot 3.4.13 — end of open-source support](https://spring.io/blog/2025/12/18/spring-boot-3-4-13-available-now/)
- [Spring Boot 3.5.16 — last OSS release of the 3.5.x generation](https://spring.io/blog/2026/06/25/spring-boot-3-5-16-available-now/)

## Migration

**Constraints**

- Spring Boot 4 requires Java 17 or later; verify the selected build tool and all third-party starters support the target line.
- Read the Spring Boot 4 migration guide for removed APIs and dependency changes rather than treating this as a version-only bump.

**Steps**

1. **Update Spring Boot to a supported 4.x line.** Update the parent/BOM, direct Spring Boot dependencies, and Spring Boot build plugin to the same supported 4.x release.
2. **Apply the 4.x migration guide.** Resolve migration changes for Spring Framework, Jakarta APIs, auto-configuration, and third-party starters; remove obsolete settings and keep dependency management aligned.

**Verification**

- `./mvnw -B verify || ./gradlew build`: Build and test the application against the selected Spring Boot 4.x release.
- `./mvnw -B dependency:tree || ./gradlew dependencies`: Confirm Spring Boot and Spring Framework dependencies resolve to a compatible 4.x stack.

## Detected by

The [`java`](../detectors/java.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/java.json`](https://github.com/arminazimi/evergreen/blob/main/registry/java.json), rule `java.maven.spring-boot.legacy-3x.end-of-support`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/java.maven.spring-boot.legacy-3x.end-of-support.html",
  "url": "https://arminazimi.github.io/evergreen/rules/java.maven.spring-boot.legacy-3x.end-of-support.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/java.maven.spring-boot.legacy-3x.end-of-support.html",
  "headline": "Spring Boot 3.x is out of open-source support — dates, impact, migration",
  "description": "Spring Boot 3.x has reached the end of its open-source support lifecycle. The 3.3.x and 3.4.x lines were explicitly marked as the end of OSS support, and 3.5.16 was announced as the last OSS release…",
  "inLanguage": "en",
  "dateModified": "2026-10-25",
  "keywords": [
    "end-of-support",
    "java",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Spring Boot 3.x is out of open-source support",
    "identifier": "pkg:maven/org.springframework.boot/spring-boot"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Spring Boot 3.3.13 — end of open-source support",
      "url": "https://spring.io/blog/2025/06/19/spring-boot-3-3-13-available-now/"
    },
    {
      "@type": "CreativeWork",
      "name": "Spring Boot 3.4.13 — end of open-source support",
      "url": "https://spring.io/blog/2025/12/18/spring-boot-3-4-13-available-now/"
    },
    {
      "@type": "CreativeWork",
      "name": "Spring Boot 3.5.16 — last OSS release of the 3.5.x generation",
      "url": "https://spring.io/blog/2026/06/25/spring-boot-3-5-16-available-now/"
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
