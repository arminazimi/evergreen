---
title: "Is Java end of life? — versions, dates, sources"
description: "Java has releases that are out of support. Java 12 to 16 are no longer supported. The source gives no day."
canonical_url: "https://arminazimi.github.io/evergreen/eol/java.html"
---

# Is Java end of life?

**Java has releases that are out of support.** Java 12 to 16 are no longer supported. The source gives no day. This page lists 5 reviewed lifecycle rules for `pkg:generic/java`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:generic/java
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [Java 12 to 16 are no longer supported](../rules/java.jdk.end-of-support-12-16.html) | End of support | The source gives no day | `vers:semver/>=12.0.0\|<17.0.0` | [Oracle Java SE Support Roadmap](https://www.oracle.com/java/technologies/java-se-support-roadmap.html), [Eclipse Temurin support](https://adoptium.net/support/) |
| [Java 18 to 20 are no longer supported](../rules/java.jdk.end-of-support-18-20.html) | End of support | The source gives no day | `vers:semver/>=18.0.0\|<21.0.0` | [Oracle Java SE Support Roadmap](https://www.oracle.com/java/technologies/java-se-support-roadmap.html), [Eclipse Temurin support](https://adoptium.net/support/) |
| [Java 22 to 24 are no longer supported](../rules/java.jdk.end-of-support-22-24.html) | End of support | The source gives no day | `vers:semver/>=22.0.0\|<25.0.0` | [Oracle Java SE Support Roadmap](https://www.oracle.com/java/technologies/java-se-support-roadmap.html), [Eclipse Temurin support](https://adoptium.net/support/) |
| [Java 26 is no longer supported](../rules/java.jdk.end-of-support-26.html) | End of support | The source gives no day | `vers:semver/>=26.0.0\|<27.0.0` | [Oracle Java SE Support Roadmap](https://www.oracle.com/java/technologies/java-se-support-roadmap.html), [Eclipse Temurin support](https://adoptium.net/support/) |
| [Java 9 and 10 are no longer supported](../rules/java.jdk.end-of-support-9-10.html) | End of support | The source gives no day | `vers:semver/>=9.0.0\|<11.0.0` | [Oracle Java SE Support Roadmap](https://www.oracle.com/java/technologies/java-se-support-roadmap.html) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/java.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/java.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Java end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Java has releases that are out of support. Java 12 to 16 are no longer supported. The source gives no day. This page lists 5 reviewed lifecycle rules for pkg:generic/java, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check Java?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:generic/java."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the Java dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
