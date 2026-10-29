---
title: "Rails 8.0 security support is scheduled to end — dates, impact, migration"
description: "The Rails maintenance policy says Rails 8.0.x receives security fixes until 2026-11-07. Rails 8.1.x is the newer supported release series."
canonical_url: "https://arminazimi.github.io/evergreen/rules/ruby.gem.rails-8.0.scheduled-end-of-life.html"
---

# Rails 8.0 security support is scheduled to end

The Rails maintenance policy says Rails 8.0.x receives security fixes until 2026-11-07. Rails 8.1.x is the newer supported release series.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Scheduled end of life |
| Severity | low |
| Ecosystem | `ruby` |
| Component | `pkg:gem/rails` |
| Affected versions | `vers:gem/>=8.0.0\|<8.1.0` |
| Date from the source | 2026-11-07 |
| Replacement | Rails 8.1.x |
| Evidence last seen | 2026-10-23 |
| Reviewed | 2026-10-23 by arminazimi |
| Review due | 2027-01-21 (90 days after the last review) |
| Rule ID | `ruby.gem.rails-8.0.scheduled-end-of-life` |

## Sources

- [Ruby on Rails maintenance policy](https://rubyonrails.org/maintenance)
- [Upgrading Ruby on Rails](https://guides.rubyonrails.org/upgrading_ruby_on_rails.html)

## Migration

**Constraints**

- Preserve application behavior and public interfaces while applying the official Rails 8.1 upgrade section.
- Keep the Gemfile requirement and every Gemfile.lock on the same Rails 8.1 release series.

**Steps**

1. **Upgrade Rails to 8.1.** Set Rails to the latest 8.1 patch in the Gemfile and run `bundle update rails` to refresh every Gemfile.lock.
2. **Apply the Rails 8.1 upgrade section.** Follow the official 8.0-to-8.1 section and resolve each listed behavior change before enabling the Rails 8.1 framework defaults.
3. **Review the Rails 8.1 defaults.** Run `bin/rails app:update`, review every generated change, enable the new framework defaults gradually, and update `config.load_defaults` only after the application is ready.

**Verification**

- `bundle check`: Confirm the updated Rails dependency set is installed and consistent.
- `bin/rails test`: Run the Rails test suite after the upgrade.
- `bin/rails runner 'puts Rails.version'`: Confirm the application boots on Rails 8.1.

## Detected by

The `ruby` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/ruby.json`](https://github.com/arminazimi/evergreen/blob/main/registry/ruby.json), rule `ruby.gem.rails-8.0.scheduled-end-of-life`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/ruby.gem.rails-8.0.scheduled-end-of-life.html",
  "url": "https://arminazimi.github.io/evergreen/rules/ruby.gem.rails-8.0.scheduled-end-of-life.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/ruby.gem.rails-8.0.scheduled-end-of-life.html",
  "headline": "Rails 8.0 security support is scheduled to end — dates, impact, migration",
  "description": "The Rails maintenance policy says Rails 8.0.x receives security fixes until 2026-11-07. Rails 8.1.x is the newer supported release series.",
  "inLanguage": "en",
  "dateModified": "2026-10-23",
  "keywords": [
    "scheduled-end-of-life",
    "ruby",
    "low"
  ],
  "about": {
    "@type": "Thing",
    "name": "Rails 8.0 security support is scheduled to end",
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
}
</script>
