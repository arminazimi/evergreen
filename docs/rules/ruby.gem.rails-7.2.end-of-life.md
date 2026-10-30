---
title: "Rails 7.2 is end-of-life — dates, impact, migration"
description: "The Rails maintenance policy no longer lists Rails 7.2.x as supported. The Rails end-of-support announcement set its security support deadline to 2026-08-09."
canonical_url: "https://arminazimi.github.io/evergreen/rules/ruby.gem.rails-7.2.end-of-life.html"
json_twin: "/rules/ruby.gem.rails-7.2.end-of-life.json"
---

# Rails 7.2 is end-of-life

**End of life** as of 2026-08-09. Replacement: Rails 8.1.x. Source: [Ruby on Rails maintenance policy](https://rubyonrails.org/maintenance).

Check a version:

```bash
evergreen check pkg:gem/rails
```

The Rails maintenance policy no longer lists Rails 7.2.x as supported. The Rails end-of-support announcement set its security support deadline to 2026-08-09.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `ruby` |
| Component | `pkg:gem/rails` |
| Affected versions | `vers:gem/>=7.2.0\|<8.0.0` |
| Date from the source | 2026-08-09 |
| Replacement | Rails 8.1.x |
| Evidence last seen | 2026-10-23 |
| Reviewed | 2026-10-23 by arminazimi |
| Review due | 2027-01-21 (90 days after the last review) |
| Rule ID | `ruby.gem.rails-7.2.end-of-life` |

## Sources

- [Ruby on Rails maintenance policy](https://rubyonrails.org/maintenance)
- [Rails releases and end-of-support announcement](https://rubyonrails.org/2025/10/29/new-rails-releases-and-end-of-support-announcement)
- [Upgrading Ruby on Rails](https://guides.rubyonrails.org/upgrading_ruby_on_rails.html)

## Migration

**Constraints**

- Preserve application behavior and public interfaces while applying the official Rails 8.0 and 8.1 upgrade sections in order.
- Upgrade Ruby separately and first when necessary; Rails 8.0 and 8.1 require Ruby 3.2 or newer.
- Keep the Gemfile requirement and every Gemfile.lock on the same supported Rails release series.

**Steps**

1. **Upgrade Rails 7.2 to Rails 8.0, then 8.1.** Set Rails to the latest 8.0 patch and run `bundle update rails`; after the application passes its checks, repeat for Rails 8.1.x.
2. **Apply the Rails 8.0 and 8.1 upgrade sections.** Follow the official 7.2-to-8.0 and 8.0-to-8.1 sections, resolve each listed behavior change, and run the application tests between the two upgrades.
3. **Review the new framework defaults.** Run `bin/rails app:update`, review every generated change, enable the new framework defaults gradually, and update `config.load_defaults` only after the application is ready.

**Verification**

- `bundle check`: Confirm the updated Rails dependency set is installed and consistent.
- `bin/rails test`: Run the Rails test suite after each upgrade step.
- `bin/rails runner 'puts Rails.version'`: Confirm the application boots on the intended Rails release.

## Detected by

The `ruby` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/ruby.json`](https://github.com/arminazimi/evergreen/blob/main/registry/ruby.json), rule `ruby.gem.rails-7.2.end-of-life`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/ruby.gem.rails-7.2.end-of-life.html",
      "url": "https://arminazimi.github.io/evergreen/rules/ruby.gem.rails-7.2.end-of-life.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/ruby.gem.rails-7.2.end-of-life.html",
      "headline": "Rails 7.2 is end-of-life — dates, impact, migration",
      "description": "The Rails maintenance policy no longer lists Rails 7.2.x as supported. The Rails end-of-support announcement set its security support deadline to 2026-08-09.",
      "inLanguage": "en",
      "dateModified": "2026-10-23",
      "keywords": [
        "end-of-life",
        "ruby",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "Rails 7.2 is end-of-life",
        "identifier": "pkg:gem/rails"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Ruby on Rails maintenance policy",
          "url": "https://rubyonrails.org/maintenance"
        },
        {
          "@type": "CreativeWork",
          "name": "Rails releases and end-of-support announcement",
          "url": "https://rubyonrails.org/2025/10/29/new-rails-releases-and-end-of-support-announcement"
        },
        {
          "@type": "CreativeWork",
          "name": "Upgrading Ruby on Rails",
          "url": "https://guides.rubyonrails.org/upgrading_ruby_on_rails.html"
        }
      ],
      "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/ruby.json",
      "publisher": {
        "@type": "Organization",
        "name": "Evergreen",
        "url": "https://arminazimi.github.io/evergreen"
      }
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/ruby.gem.rails-7.2.end-of-life.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/ruby.gem.rails-7.2.end-of-life.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:gem/rails?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life as of 2026-08-09. Affected versions: vers:gem/>=7.2.0|\u003c8.0.0. Source: Ruby on Rails maintenance policy (https://rubyonrails.org/maintenance)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:gem/rails?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Rails 8.1.x"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:gem/rails?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:gem/rails."
          }
        }
      ]
    }
  ]
}
</script>
