---
title: "json 2.17.1.1 is yanked — dates, impact, migration"
description: "RubyGems lists json 2.17.1.1 as yanked: the version is not available for download or for other gems that depended on it. The version page also flags two known security vulnerabilities."
canonical_url: "https://arminazimi.github.io/evergreen/rules/ruby.gem.json.yanked-2.17.1.1.html"
---

# json 2.17.1.1 is yanked

RubyGems lists json 2.17.1.1 as yanked: the version is not available for download or for other gems that depended on it. The version page also flags two known security vulnerabilities.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Removed |
| Severity | high |
| Ecosystem | `ruby` |
| Component | `pkg:gem/json` |
| Affected versions | `vers:gem/2.17.1.1` |
| Date from the source | The source gives no day |
| Replacement | A published json release that is not yanked |
| Evidence last seen | 2026-10-18 |
| Reviewed | 2026-10-18 by arminazimi |
| Review due | 2027-01-16 (90 days after the last review) |
| Rule ID | `ruby.gem.json.yanked-2.17.1.1` |

## Sources

- [RubyGems: json 2.17.1.1 is yanked](https://rubygems.org/gems/json/versions/2.17.1.1)

## Migration

**Constraints**

- Keep the Gemfile requirement, Gemfile.lock resolved version, and gemspec constraint on a published json release.
- Regenerate the lockfile after changing the requirement; do not keep a yanked version in the resolution.

**Steps**

1. **Move off the yanked version.** Change the Gemfile or gemspec constraint to a published json release and run `bundle update json` so Gemfile.lock resolves a version that is not yanked.
2. **Align the lockfile and gemspec.** Check every Gemfile.lock in the repository and the gemspec constraint so none resolves the yanked version.

**Verification**

- `bundle exec ruby -e 'require "json"; puts JSON::VERSION'`: Confirm the resolved json version.
- `bundle exec rake test`: Run the test suite with the replacement version.

## Detected by

The `ruby` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/ruby.json`](https://github.com/arminazimi/evergreen/blob/main/registry/ruby.json), rule `ruby.gem.json.yanked-2.17.1.1`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/ruby.gem.json.yanked-2.17.1.1.html",
  "url": "https://arminazimi.github.io/evergreen/rules/ruby.gem.json.yanked-2.17.1.1.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/ruby.gem.json.yanked-2.17.1.1.html",
  "headline": "json 2.17.1.1 is yanked — dates, impact, migration",
  "description": "RubyGems lists json 2.17.1.1 as yanked: the version is not available for download or for other gems that depended on it. The version page also flags two known security vulnerabilities.",
  "inLanguage": "en",
  "dateModified": "2026-10-18",
  "keywords": [
    "removed",
    "ruby",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "json 2.17.1.1 is yanked",
    "identifier": "pkg:gem/json"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "RubyGems: json 2.17.1.1 is yanked",
      "url": "https://rubygems.org/gems/json/versions/2.17.1.1"
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
