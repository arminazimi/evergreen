---
title: "Is Spring Boot end of life? — versions, dates, sources"
description: "Spring Boot has releases that are out of support. Spring Boot 1.x is out of open-source support. The source gives no day."
canonical_url: "https://arminazimi.github.io/evergreen/eol/maven-org-springframework-boot-spring-boot.html"
---

# Is Spring Boot end of life?

**Spring Boot has releases that are out of support.** Spring Boot 1.x is out of open-source support. The source gives no day. This page lists 3 reviewed lifecycle rules for `pkg:maven/org.springframework.boot/spring-boot`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:maven/org.springframework.boot/spring-boot
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [Spring Boot 1.x is out of open-source support](../rules/java.maven.spring-boot.legacy-1x.end-of-support.html) | End of support | The source gives no day | `vers:maven/>=1.0.0\|<2.0.0` | [Spring Boot support policy](https://spring.io/projects/spring-boot#support) |
| [Spring Boot 2.x is out of open-source support](../rules/java.maven.spring-boot.legacy-2x.end-of-support.html) | End of support | The source gives no day | `vers:maven/>=2.0.0\|<3.0.0` | [Spring Boot support policy](https://spring.io/projects/spring-boot#support) |
| [Spring Boot 3.x is out of open-source support](../rules/java.maven.spring-boot.legacy-3x.end-of-support.html) | End of support | The source gives no day | `vers:maven/>=3.0.0\|<4.0.0` | [Spring Boot 3.3.13 — end of open-source support](https://spring.io/blog/2025/06/19/spring-boot-3-3-13-available-now/), [Spring Boot 3.4.13 — end of open-source support](https://spring.io/blog/2025/12/18/spring-boot-3-4-13-available-now/), [Spring Boot 3.5.16 — last OSS release of the 3.5.x generation](https://spring.io/blog/2026/06/25/spring-boot-3-5-16-available-now/) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/maven-org-springframework-boot-spring-boot.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/maven-org-springframework-boot-spring-boot.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Spring Boot end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Spring Boot has releases that are out of support. Spring Boot 1.x is out of open-source support. The source gives no day. This page lists 3 reviewed lifecycle rules for pkg:maven/org.springframework.boot/spring-boot, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check Spring Boot?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:maven/org.springframework.boot/spring-boot."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the Spring Boot dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
