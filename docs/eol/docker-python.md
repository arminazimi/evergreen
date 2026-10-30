---
title: "Is Python Docker image end of life? — versions, dates, sources"
description: "Some Python Docker image releases are end of life. Python image release lines 3.10 and older are end-of-life as of 2026-10-01."
canonical_url: "https://arminazimi.github.io/evergreen/eol/docker-python.html"
---

# Is Python Docker image end of life?

**Some Python Docker image releases are end of life.** Python image release lines 3.10 and older are end-of-life as of 2026-10-01. This page lists 1 reviewed lifecycle rule for `pkg:docker/library/python`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:docker/library/python
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [Python image release lines 3.10 and older are end-of-life](../rules/container.python.eol-3.10-and-older.html) | End of life | 2026-10-01 | `vers:semver/<3.11.0` | [Status of Python versions](https://devguide.python.org/versions/), [Python release cycle (machine-readable)](https://peps.python.org/api/release-cycle.json) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/docker-python.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/docker-python.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Python Docker image end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Some Python Docker image releases are end of life. Python image release lines 3.10 and older are end-of-life as of 2026-10-01. This page lists 1 reviewed lifecycle rule for pkg:docker/library/python, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check Python Docker image?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:docker/library/python."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the Python Docker image dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
