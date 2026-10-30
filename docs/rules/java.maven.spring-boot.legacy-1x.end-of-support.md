---
title: "Spring Boot 1.x is out of open-source support — dates, impact, migration"
description: "Spring Boot 1.x has reached the end of its open-source support lifecycle. Upgrade to a supported Spring Boot 4.x line; assess the 1.x-to-4.x migration in stages because it crosses multiple major…"
canonical_url: "https://arminazimi.github.io/evergreen/rules/java.maven.spring-boot.legacy-1x.end-of-support.html"
image: "/assets/og/java.maven.spring-boot.legacy-1x.end-of-support.svg"
json_twin: "/rules/java.maven.spring-boot.legacy-1x.end-of-support.json"
---

# Spring Boot 1.x is out of open-source support

**End of support.** The source gives no day. Replacement: Spring Boot 4.1.x. Source: [Spring Boot support policy](https://spring.io/projects/spring-boot#support).

Check a version:

```bash
evergreen check pkg:maven/org.springframework.boot/spring-boot
```

Spring Boot 1.x has reached the end of its open-source support lifecycle. Upgrade to a supported Spring Boot 4.x line; assess the 1.x-to-4.x migration in stages because it crosses multiple major releases. Commercial support availability is separate from community OSS support.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `java` |
| Component | `pkg:maven/org.springframework.boot/spring-boot` |
| Affected versions | `vers:maven/>=1.0.0\|<2.0.0` |
| Date from the source | The source gives no day |
| Replacement | Spring Boot 4.1.x |
| Evidence last seen | 2026-10-25 |
| Reviewed | 2026-10-25 by Aaqibhafeezkhan |
| Review due | 2027-04-23 (180 days after the last review) |
| Rule ID | `java.maven.spring-boot.legacy-1x.end-of-support` |

## Sources

- [Spring Boot support policy](https://spring.io/projects/spring-boot#support)

## Migration

**Constraints**

- This finding describes open-source support, not whether a commercial support contract exists.
- Do not jump directly across several major versions without reviewing each intervening migration guide and compatibility requirements.

**Steps**

1. **Plan the major-version upgrade.** Inventory Spring Boot, Spring Framework, Java, build-tool, and managed dependency versions. Read each Spring Boot migration guide between the current version and the selected 4.x target.
2. **Align Spring Boot declarations.** Update the Spring Boot dependency, parent/BOM, plugin, and related build declarations consistently, then resolve and remove obsolete configuration using the migration guides.

**Verification**

- `./mvnw -B verify || ./gradlew build`: Build and run the project's tests after the staged upgrade.
- `./mvnw -B dependency:tree || ./gradlew dependencies`: Review the resolved Spring dependency graph for mixed or obsolete versions.

## Detected by

The [`java`](../detectors/java.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/java.json`](https://github.com/arminazimi/evergreen/blob/main/registry/java.json), rule `java.maven.spring-boot.legacy-1x.end-of-support`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/java.maven.spring-boot.legacy-1x.end-of-support.html",
      "url": "https://arminazimi.github.io/evergreen/rules/java.maven.spring-boot.legacy-1x.end-of-support.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/java.maven.spring-boot.legacy-1x.end-of-support.html",
      "headline": "Spring Boot 1.x is out of open-source support — dates, impact, migration",
      "description": "Spring Boot 1.x has reached the end of its open-source support lifecycle. Upgrade to a supported Spring Boot 4.x line; assess the 1.x-to-4.x migration in stages because it crosses multiple major…",
      "inLanguage": "en",
      "dateModified": "2026-10-25",
      "keywords": [
        "end-of-support",
        "java",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "Spring Boot 1.x is out of open-source support",
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
      "@id": "https://arminazimi.github.io/evergreen/rules/java.maven.spring-boot.legacy-1x.end-of-support.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/java.maven.spring-boot.legacy-1x.end-of-support.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:maven/org.springframework.boot/spring-boot?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of support. The source gives no day. Affected versions: vers:maven/>=1.0.0|\u003c2.0.0. Source: Spring Boot support policy (https://spring.io/projects/spring-boot#support)."
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
