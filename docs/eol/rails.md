---
title: "Is Rails end of life? — versions, dates, sources"
description: "Some Rails releases are end of life. Rails 7.2 is end-of-life as of 2026-08-09. This page lists 2 reviewed lifecycle rules for pkg:gem/rails, with the status, date, and source for each."
canonical_url: "https://arminazimi.github.io/evergreen/eol/rails.html"
---

# Is Rails end of life?

**Some Rails releases are end of life.** Rails 7.2 is end-of-life as of 2026-08-09. This page lists 2 reviewed lifecycle rules for `pkg:gem/rails`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:gem/rails
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [Rails 7.2 is end-of-life](../rules/ruby.gem.rails-7.2.end-of-life.html) | End of life | 2026-08-09 | `vers:gem/>=7.2.0\|<8.0.0` | [Ruby on Rails maintenance policy](https://rubyonrails.org/maintenance), [Rails releases and end-of-support announcement](https://rubyonrails.org/2025/10/29/new-rails-releases-and-end-of-support-announcement), [Upgrading Ruby on Rails](https://guides.rubyonrails.org/upgrading_ruby_on_rails.html) |
| [Rails 8.0 security support is scheduled to end](../rules/ruby.gem.rails-8.0.scheduled-end-of-life.html) | Scheduled end of life | 2026-11-07 | `vers:gem/>=8.0.0\|<8.1.0` | [Ruby on Rails maintenance policy](https://rubyonrails.org/maintenance), [Upgrading Ruby on Rails](https://guides.rubyonrails.org/upgrading_ruby_on_rails.html) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/rails.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/rails.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Rails end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Some Rails releases are end of life. Rails 7.2 is end-of-life as of 2026-08-09. This page lists 2 reviewed lifecycle rules for pkg:gem/rails, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check Rails?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:gem/rails."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the Rails dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
