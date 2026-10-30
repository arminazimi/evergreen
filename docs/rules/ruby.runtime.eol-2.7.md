---
title: "Ruby 2.7 is end-of-life — dates, impact, migration"
description: "The Ruby maintenance branches page marks Ruby 2.7 as eol: normal maintenance ended on 2022-04-01 and the branch reached end-of-life on 2023-03-31."
canonical_url: "https://arminazimi.github.io/evergreen/rules/ruby.runtime.eol-2.7.html"
json_twin: "/rules/ruby.runtime.eol-2.7.json"
---

# Ruby 2.7 is end-of-life

**End of life** as of 2023-03-31. Replacement: Ruby 3.4 or later. Source: [Ruby maintenance branches](https://www.ruby-lang.org/en/downloads/branches/).

Check a version:

```bash
evergreen check pkg:generic/ruby
```

The Ruby maintenance branches page marks Ruby 2.7 as eol: normal maintenance ended on 2022-04-01 and the branch reached end-of-life on 2023-03-31.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `ruby` |
| Component | `pkg:generic/ruby` |
| Affected versions | `vers:gem/>=2.7.0\|<3.0.0` |
| Date from the source | 2023-03-31 |
| Replacement | Ruby 3.4 or later |
| Evidence last seen | 2026-10-18 |
| Reviewed | 2026-10-18 by arminazimi |
| Review due | 2027-01-16 (90 days after the last review) |
| Rule ID | `ruby.runtime.eol-2.7` |

## Sources

- [Ruby maintenance branches](https://www.ruby-lang.org/en/downloads/branches/)

## Migration

**Constraints**

- Keep .ruby-version, .tool-versions, the Gemfile ruby directive, Gemfile.lock RUBY VERSION, gemspec required_ruby_version, CI matrices, and container images on one supported Ruby branch.
- Confirm gems with native extensions build on the target Ruby and reinstall bundled gems.

**Steps**

1. **Raise the Ruby version.** Change the reported declaration from Ruby 2.7 to a supported release (see the replacement), using the project's existing version manager.
2. **Align other Ruby version surfaces.** Update CI setup-ruby versions, Dockerfile `ruby:` images, the Gemfile ruby directive, Gemfile.lock, and gemspec required_ruby_version so they agree.

**Verification**

- `ruby --version`: Confirm the active runtime is the intended release.
- `bundle install`: Re-resolve and install gems on the new Ruby.
- `bundle exec rake test`: Run the test suite on the new Ruby.

## Detected by

The `ruby` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Other versions of this product

- [Ruby 1.9.3 is end-of-life](ruby.runtime.eol-1.9.3.html)
- [Ruby 2.0.0 is end-of-life](ruby.runtime.eol-2.0.0.html)
- [Ruby 2.1 is end-of-life](ruby.runtime.eol-2.1.html)
- [Ruby 2.2 is end-of-life](ruby.runtime.eol-2.2.html)
- [Ruby 2.3 is end-of-life](ruby.runtime.eol-2.3.html)
- [Ruby 2.4 is end-of-life](ruby.runtime.eol-2.4.html)
- [Ruby 2.5 is end-of-life](ruby.runtime.eol-2.5.html)
- [Ruby 2.6 is end-of-life](ruby.runtime.eol-2.6.html)
- [Ruby 3.0 is end-of-life](ruby.runtime.eol-3.0.html)
- [Ruby 3.1 is end-of-life](ruby.runtime.eol-3.1.html)
- [Ruby 3.2 is end-of-life](ruby.runtime.eol-3.2.html)

### Same ecosystem

- [json 2.17.1.1 is yanked](ruby.gem.json.yanked-2.17.1.1.html)
- [Rails 7.2 is end-of-life](ruby.gem.rails-7.2.end-of-life.html)
- [Rails 8.0 security support is scheduled to end](ruby.gem.rails-8.0.scheduled-end-of-life.html)


## Data

This page is generated from [`registry/ruby.json`](https://github.com/arminazimi/evergreen/blob/main/registry/ruby.json), rule `ruby.runtime.eol-2.7`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/ruby.runtime.eol-2.7.html",
      "url": "https://arminazimi.github.io/evergreen/rules/ruby.runtime.eol-2.7.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/ruby.runtime.eol-2.7.html",
      "headline": "Ruby 2.7 is end-of-life — dates, impact, migration",
      "description": "The Ruby maintenance branches page marks Ruby 2.7 as eol: normal maintenance ended on 2022-04-01 and the branch reached end-of-life on 2023-03-31.",
      "inLanguage": "en",
      "dateModified": "2026-10-18",
      "keywords": [
        "end-of-life",
        "ruby",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "Ruby 2.7 is end-of-life",
        "identifier": "pkg:generic/ruby"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Ruby maintenance branches",
          "url": "https://www.ruby-lang.org/en/downloads/branches/"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/ruby.runtime.eol-2.7.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/ruby.runtime.eol-2.7.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/ruby?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life as of 2023-03-31. Affected versions: vers:gem/>=2.7.0|\u003c3.0.0. Source: Ruby maintenance branches (https://www.ruby-lang.org/en/downloads/branches/)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/ruby?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Ruby 3.4 or later"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/ruby?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/ruby."
          }
        }
      ]
    }
  ]
}
</script>
