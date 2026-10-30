---
title: "Is Ubuntu end of life? — versions, dates, sources"
description: "Some Ubuntu releases are end of life. Ubuntu image release lines 20.04 and older are past standard support end-of-life as of 2025-05-31."
canonical_url: "https://arminazimi.github.io/evergreen/eol/docker-ubuntu.html"
---

# Is Ubuntu end of life?

**Some Ubuntu releases are end of life.** Ubuntu image release lines 20.04 and older are past standard support end-of-life as of 2025-05-31. This page lists 2 reviewed lifecycle rules for `pkg:docker/library/ubuntu`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:docker/library/ubuntu
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [Ubuntu image release lines 20.04 and older are past standard support end-of-life](../rules/container.ubuntu.eol-20.04-and-older.html) | End of life | 2025-05-31 | `vers:semver/<20.10.0` | [Ubuntu release cycle](https://ubuntu.com/about/release-cycle) |
| [Ubuntu image release line 22.04 reaches standard support end-of-life on 2027-06-01](../rules/container.ubuntu.eol-22.04.html) | Scheduled end of life | 2027-06-01 | `vers:semver/>=22.0.0\|<22.10.0` | [Ubuntu release cycle](https://ubuntu.com/about/release-cycle) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/docker-ubuntu.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/docker-ubuntu.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Ubuntu end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Some Ubuntu releases are end of life. Ubuntu image release lines 20.04 and older are past standard support end-of-life as of 2025-05-31. This page lists 2 reviewed lifecycle rules for pkg:docker/library/ubuntu, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check Ubuntu?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:docker/library/ubuntu."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the Ubuntu dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
