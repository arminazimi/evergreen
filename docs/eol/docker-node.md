---
title: "Is Node.js Docker image end of life? — versions, dates, sources"
description: "Some Node.js Docker image releases are end of life. Node.js image release lines 21 and older are end-of-life as of 2026-04-30."
canonical_url: "https://arminazimi.github.io/evergreen/eol/docker-node.html"
---

# Is Node.js Docker image end of life?

**Some Node.js Docker image releases are end of life.** Node.js image release lines 21 and older are end-of-life as of 2026-04-30. This page lists 2 reviewed lifecycle rules for `pkg:docker/library/node`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:docker/library/node
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [Node.js image release lines 21 and older are end-of-life](../rules/container.node.eol-21-and-older.html) | End of life | 2026-04-30 | `vers:semver/<22.0.0` | [Node.js end-of-life releases](https://nodejs.org/en/about/eol), [Node.js Release Working Group schedule](https://github.com/nodejs/Release/blob/main/schedule.json) |
| [Node.js image release line 22 reaches end-of-life on 2027-04-30](../rules/container.node.eol-22-and-older.html) | Scheduled end of life | 2027-04-30 | `vers:semver/>=22.0.0\|<23.0.0` | [Node.js end-of-life releases](https://nodejs.org/en/about/eol), [Node.js Release Working Group schedule](https://github.com/nodejs/Release/blob/main/schedule.json) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/docker-node.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/docker-node.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Node.js Docker image end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Some Node.js Docker image releases are end of life. Node.js image release lines 21 and older are end-of-life as of 2026-04-30. This page lists 2 reviewed lifecycle rules for pkg:docker/library/node, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check Node.js Docker image?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:docker/library/node."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the Node.js Docker image dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
