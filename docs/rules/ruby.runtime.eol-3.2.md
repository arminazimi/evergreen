---
title: "Ruby 3.2 is end-of-life — dates, impact, migration"
description: "The Ruby maintenance branches page marks Ruby 3.2 as eol: normal maintenance ended on 2025-04-01 and the branch reached end-of-life on 2026-04-01."
canonical_url: "https://arminazimi.github.io/evergreen/rules/ruby.runtime.eol-3.2.html"
---

# Ruby 3.2 is end-of-life

**End of life** as of 2026-04-01. Replacement: Ruby 3.4 or later. Source: [Ruby maintenance branches](https://www.ruby-lang.org/en/downloads/branches/).

Check a version:

```bash
evergreen check pkg:generic/ruby
```

The Ruby maintenance branches page marks Ruby 3.2 as eol: normal maintenance ended on 2025-04-01 and the branch reached end-of-life on 2026-04-01.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `ruby` |
| Component | `pkg:generic/ruby` |
| Affected versions | `vers:gem/>=3.2.0\|<3.3.0` |
| Date from the source | 2026-04-01 |
| Replacement | Ruby 3.4 or later |
| Evidence last seen | 2026-10-18 |
| Reviewed | 2026-10-18 by arminazimi |
| Review due | 2027-01-16 (90 days after the last review) |
| Rule ID | `ruby.runtime.eol-3.2` |

## Sources

- [Ruby maintenance branches](https://www.ruby-lang.org/en/downloads/branches/)

## Migration

**Constraints**

- Keep .ruby-version, .tool-versions, the Gemfile ruby directive, Gemfile.lock RUBY VERSION, gemspec required_ruby_version, CI matrices, and container images on one supported Ruby branch.
- Confirm gems with native extensions build on the target Ruby and reinstall bundled gems.

**Steps**

1. **Raise the Ruby version.** Change the reported declaration from Ruby 3.2 to a supported release (see the replacement), using the project's existing version manager.
2. **Align other Ruby version surfaces.** Update CI setup-ruby versions, Dockerfile `ruby:` images, the Gemfile ruby directive, Gemfile.lock, and gemspec required_ruby_version so they agree.

**Verification**

- `ruby --version`: Confirm the active runtime is the intended release.
- `bundle install`: Re-resolve and install gems on the new Ruby.
- `bundle exec rake test`: Run the test suite on the new Ruby.

## Detected by

The `ruby` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/ruby.json`](https://github.com/arminazimi/evergreen/blob/main/registry/ruby.json), rule `ruby.runtime.eol-3.2`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/ruby.runtime.eol-3.2.html",
  "url": "https://arminazimi.github.io/evergreen/rules/ruby.runtime.eol-3.2.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/ruby.runtime.eol-3.2.html",
  "headline": "Ruby 3.2 is end-of-life — dates, impact, migration",
  "description": "The Ruby maintenance branches page marks Ruby 3.2 as eol: normal maintenance ended on 2025-04-01 and the branch reached end-of-life on 2026-04-01.",
  "inLanguage": "en",
  "dateModified": "2026-10-18",
  "keywords": [
    "end-of-life",
    "ruby",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Ruby 3.2 is end-of-life",
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
}
</script>
