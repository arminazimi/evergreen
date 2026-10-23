---
title: "Rails 7.1 and older release series are end-of-life — dates, impact, migration"
description: "The Rails maintenance policy lists only Rails 8.0.x and 8.1.x as supported and says unsupported release series receive no bug or security fixes. Rails 7.1 and older are therefore end-of-life."
canonical_url: "https://arminazimi.github.io/evergreen/rules/ruby.gem.rails-7.1-and-older.end-of-life.html"
---

# Rails 7.1 and older release series are end-of-life

The Rails maintenance policy lists only Rails 8.0.x and 8.1.x as supported and says unsupported release series receive no bug or security fixes. Rails 7.1 and older are therefore end-of-life.

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `ruby` |
| Component | `pkg:gem/rails` |
| Affected versions | `vers:gem/<7.2.0` |
| Date from the source | The source gives no day |
| Replacement | Rails 8.1.x |
| Evidence last seen | 2026-10-23 |
| Reviewed | 2026-10-23 by arminazimi |
| Review due | 2027-01-21 (90 days after the last review) |
| Rule ID | `ruby.gem.rails-7.1-and-older.end-of-life` |

## Sources

- [Ruby on Rails maintenance policy](https://rubyonrails.org/maintenance)
- [Upgrading Ruby on Rails](https://guides.rubyonrails.org/upgrading_ruby_on_rails.html)

## Migration

**Constraints**

- Preserve application behavior and public interfaces while applying the official upgrade guide one Rails minor release at a time.
- Upgrade Ruby separately and first when a target Rails release requires a newer Ruby; Rails 8.1 requires Ruby 3.2 or newer.
- Keep the Gemfile requirement and every Gemfile.lock on the same supported Rails release series.

**Steps**

1. **Move Rails to the next minor release.** Change the Rails requirement to the latest patch of the next minor release, run `bundle update rails`, and repeat until the application reaches Rails 8.1.x.
2. **Apply each official upgrade section.** For every minor-version step, follow the matching section of the official Upgrading Ruby on Rails guide, resolve deprecations and breaking changes, and run the application tests before continuing.
3. **Review the new framework defaults.** Run `bin/rails app:update`, review every generated change, enable the new framework defaults gradually, and update `config.load_defaults` only after the application is ready.

**Verification**

- `bundle check`: Confirm the updated Rails dependency set is installed and consistent.
- `bin/rails test`: Run the Rails test suite after each upgrade step.
- `bin/rails runner 'puts Rails.version'`: Confirm the application boots on the intended Rails release.

## Detected by

The `ruby` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/ruby.json`](https://github.com/arminazimi/evergreen/blob/main/registry/ruby.json), rule `ruby.gem.rails-7.1-and-older.end-of-life`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/ruby.gem.rails-7.1-and-older.end-of-life.html",
  "url": "https://arminazimi.github.io/evergreen/rules/ruby.gem.rails-7.1-and-older.end-of-life.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/ruby.gem.rails-7.1-and-older.end-of-life.html",
  "headline": "Rails 7.1 and older release series are end-of-life — dates, impact, migration",
  "description": "The Rails maintenance policy lists only Rails 8.0.x and 8.1.x as supported and says unsupported release series receive no bug or security fixes. Rails 7.1 and older are therefore end-of-life.",
  "inLanguage": "en",
  "dateModified": "2026-10-23",
  "keywords": [
    "end-of-life",
    "ruby",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Rails 7.1 and older release series are end-of-life",
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
