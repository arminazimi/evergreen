---
title: "Is Drupal end of life? — versions, dates, sources"
description: "Some Drupal releases are end of life. Drupal image release lines 10.5 and older are end-of-life as of 2026-07-01."
canonical_url: "https://arminazimi.github.io/evergreen/eol/docker-drupal.html"
---

# Is Drupal end of life?

**Some Drupal releases are end of life.** Drupal image release lines 10.5 and older are end-of-life as of 2026-07-01. This page lists 1 reviewed lifecycle rule for `pkg:docker/library/drupal`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:docker/library/drupal
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [Drupal image release lines 10.5 and older are end-of-life](../rules/container.drupal.eol-10.5-and-older.html) | End of life | 2026-07-01 | `vers:semver/<10.6.0` | [Drupal release policy (vendor)](https://www.drupal.org/about/core/policies/core-release-cycles/schedule) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/docker-drupal.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/docker-drupal.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Drupal end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Some Drupal releases are end of life. Drupal image release lines 10.5 and older are end-of-life as of 2026-07-01. This page lists 1 reviewed lifecycle rule for pkg:docker/library/drupal, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check Drupal?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:docker/library/drupal."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the Drupal dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
