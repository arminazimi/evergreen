---
title: "Ruby image release line 3.3 reaches end-of-life on 2027-03-31 — dates, impact, migration"
description: "Ruby 3.3 is in security maintenance and is scheduled to stop receiving fixes from the Ruby core team on 2027-03-31."
canonical_url: "https://arminazimi.github.io/evergreen/rules/container.ruby.eol-3.3-and-older.html"
json_twin: "/rules/container.ruby.eol-3.3-and-older.json"
---

# Ruby image release line 3.3 reaches end-of-life on 2027-03-31

**Scheduled end of life** as of 2027-03-31. Replacement: A ruby image on a later supported release line. Source: [Ruby maintenance branches](https://www.ruby-lang.org/en/downloads/branches/).

Check a version:

```bash
evergreen check pkg:docker/library/ruby
```

Ruby 3.3 is in security maintenance and is scheduled to stop receiving fixes from the Ruby core team on 2027-03-31.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Scheduled end of life |
| Severity | low |
| Ecosystem | `container` |
| Component | `pkg:docker/library/ruby` |
| Affected versions | `vers:semver/>=3.3.0\|<3.4.0` |
| Date from the source | 2027-03-31 |
| Replacement | A ruby image on a later supported release line |
| Evidence last seen | 2026-10-29 |
| Reviewed | 2026-10-29 by arminazimi, drafted by the `endoflife-date` importer |
| Review due | 2027-10-29 (365 days after the last review) |
| Rule ID | `container.ruby.eol-3.3-and-older` |

## Sources

- [Ruby maintenance branches](https://www.ruby-lang.org/en/downloads/branches/)

## Migration

**Constraints**

- Keep the base image, .ruby-version, Gemfile ruby requirement, and CI matrices on one supported Ruby branch.
- Confirm gems with native extensions build on the target Ruby, and rebuild bundled gems inside the image.

**Steps**

1. **Update the base image.** Change the reported FROM line or Compose image to a tag on a supported release line, and pin it to a digest if your policy requires.
2. **Align other image references.** Update other Dockerfiles, Compose files, CI service containers, and deployment manifests that use the same image so they agree.

**Verification**

- `docker build .`: Build the image on the new base.
- `docker run --rm IMAGE ruby --version`: Confirm the container runs the intended Ruby version.

## Detected by

The [`container`](../detectors/container.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/container.json`](https://github.com/arminazimi/evergreen/blob/main/registry/container.json), rule `container.ruby.eol-3.3-and-older`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/container.ruby.eol-3.3-and-older.html",
      "url": "https://arminazimi.github.io/evergreen/rules/container.ruby.eol-3.3-and-older.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/container.ruby.eol-3.3-and-older.html",
      "headline": "Ruby image release line 3.3 reaches end-of-life on 2027-03-31 — dates, impact, migration",
      "description": "Ruby 3.3 is in security maintenance and is scheduled to stop receiving fixes from the Ruby core team on 2027-03-31.",
      "inLanguage": "en",
      "dateModified": "2026-10-29",
      "keywords": [
        "scheduled-end-of-life",
        "container",
        "low"
      ],
      "about": {
        "@type": "Thing",
        "name": "Ruby image release line 3.3 reaches end-of-life on 2027-03-31",
        "identifier": "pkg:docker/library/ruby"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Ruby maintenance branches",
          "url": "https://www.ruby-lang.org/en/downloads/branches/"
        }
      ],
      "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/container.json",
      "publisher": {
        "@type": "Organization",
        "name": "Evergreen",
        "url": "https://arminazimi.github.io/evergreen"
      }
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/container.ruby.eol-3.3-and-older.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/container.ruby.eol-3.3-and-older.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:docker/library/ruby?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Scheduled end of life as of 2027-03-31. Affected versions: vers:semver/>=3.3.0|\u003c3.4.0. Source: Ruby maintenance branches (https://www.ruby-lang.org/en/downloads/branches/)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:docker/library/ruby?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A ruby image on a later supported release line"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:docker/library/ruby?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:docker/library/ruby."
          }
        }
      ]
    }
  ]
}
</script>
