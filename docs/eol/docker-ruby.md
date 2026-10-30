---
title: "Is Ruby Docker image end of life? — versions, dates, sources"
description: "Some Ruby Docker image releases are end of life. Ruby image release lines 3.2 and older are end-of-life as of 2026-04-01."
canonical_url: "https://arminazimi.github.io/evergreen/eol/docker-ruby.html"
---

# Is Ruby Docker image end of life?

**Some Ruby Docker image releases are end of life.** Ruby image release lines 3.2 and older are end-of-life as of 2026-04-01. This page lists 2 reviewed lifecycle rules for `pkg:docker/library/ruby`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:docker/library/ruby
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [Ruby image release lines 3.2 and older are end-of-life](../rules/container.ruby.eol-3.2-and-older.html) | End of life | 2026-04-01 | `vers:semver/<3.3.0` | [Ruby maintenance branches](https://www.ruby-lang.org/en/downloads/branches/) |
| [Ruby image release line 3.3 reaches end-of-life on 2027-03-31](../rules/container.ruby.eol-3.3-and-older.html) | Scheduled end of life | 2027-03-31 | `vers:semver/>=3.3.0\|<3.4.0` | [Ruby maintenance branches](https://www.ruby-lang.org/en/downloads/branches/) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/docker-ruby.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/docker-ruby.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Ruby Docker image end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Some Ruby Docker image releases are end of life. Ruby image release lines 3.2 and older are end-of-life as of 2026-04-01. This page lists 2 reviewed lifecycle rules for pkg:docker/library/ruby, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check Ruby Docker image?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:docker/library/ruby."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the Ruby Docker image dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
