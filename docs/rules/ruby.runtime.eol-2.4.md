---
title: "Ruby 2.4 is end-of-life — dates, impact, migration"
description: "The Ruby maintenance branches page marks Ruby 2.4 as eol: normal maintenance ended on 2019-04-01 and the branch reached end-of-life on 2020-03-31."
canonical_url: "https://arminazimi.github.io/evergreen/rules/ruby.runtime.eol-2.4.html"
json_twin: "/rules/ruby.runtime.eol-2.4.json"
---

# Ruby 2.4 is end-of-life

**End of life** as of 2020-03-31. Replacement: Ruby 3.4 or later. Source: [Ruby maintenance branches](https://www.ruby-lang.org/en/downloads/branches/).

Check a version:

```bash
evergreen check pkg:generic/ruby
```

The Ruby maintenance branches page marks Ruby 2.4 as eol: normal maintenance ended on 2019-04-01 and the branch reached end-of-life on 2020-03-31.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `ruby` |
| Component | `pkg:generic/ruby` |
| Affected versions | `vers:gem/>=2.4.0\|<2.5.0` |
| Date from the source | 2020-03-31 |
| Replacement | Ruby 3.4 or later |
| Evidence last seen | 2026-10-20 |
| Reviewed | 2026-10-20 by arminazimi |
| Review due | 2027-01-18 (90 days after the last review) |
| Rule ID | `ruby.runtime.eol-2.4` |

## Sources

- [Ruby maintenance branches](https://www.ruby-lang.org/en/downloads/branches/)

## Migration

**Constraints**

- Keep .ruby-version, .tool-versions, the Gemfile ruby directive, Gemfile.lock RUBY VERSION, gemspec required_ruby_version, CI matrices, and container images on one supported Ruby branch.
- Confirm gems with native extensions build on the target Ruby and reinstall bundled gems.

**Steps**

1. **Raise the Ruby version.** Change the reported declaration from Ruby 2.4 to a supported release (see the replacement), using the project's existing version manager.
2. **Align other Ruby version surfaces.** Update CI setup-ruby versions, Dockerfile `ruby:` images, the Gemfile ruby directive, Gemfile.lock, and gemspec required_ruby_version so they agree.

**Verification**

- `ruby --version`: Confirm the active runtime is the intended release.
- `bundle install`: Re-resolve and install gems on the new Ruby.
- `bundle exec rake test`: Run the test suite on the new Ruby.

## Detected by

The `ruby` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/ruby.json`](https://github.com/arminazimi/evergreen/blob/main/registry/ruby.json), rule `ruby.runtime.eol-2.4`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/ruby.runtime.eol-2.4.html",
      "url": "https://arminazimi.github.io/evergreen/rules/ruby.runtime.eol-2.4.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/ruby.runtime.eol-2.4.html",
      "headline": "Ruby 2.4 is end-of-life — dates, impact, migration",
      "description": "The Ruby maintenance branches page marks Ruby 2.4 as eol: normal maintenance ended on 2019-04-01 and the branch reached end-of-life on 2020-03-31.",
      "inLanguage": "en",
      "dateModified": "2026-10-20",
      "keywords": [
        "end-of-life",
        "ruby",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "Ruby 2.4 is end-of-life",
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
      "@id": "https://arminazimi.github.io/evergreen/rules/ruby.runtime.eol-2.4.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/ruby.runtime.eol-2.4.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/ruby?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life as of 2020-03-31. Affected versions: vers:gem/>=2.4.0|\u003c2.5.0. Source: Ruby maintenance branches (https://www.ruby-lang.org/en/downloads/branches/)."
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
