---
title: "Is Ruby end of life? — versions, dates, sources"
description: "Some Ruby releases are end of life. Ruby 3.2 is end-of-life as of 2026-04-01. This page lists 12 reviewed lifecycle rules for pkg:generic/ruby, with the status, date, and source for each."
canonical_url: "https://arminazimi.github.io/evergreen/eol/ruby.html"
---

# Is Ruby end of life?

**Some Ruby releases are end of life.** Ruby 3.2 is end-of-life as of 2026-04-01. This page lists 12 reviewed lifecycle rules for `pkg:generic/ruby`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:generic/ruby
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [Ruby 3.2 is end-of-life](../rules/ruby.runtime.eol-3.2.html) | End of life | 2026-04-01 | `vers:gem/>=3.2.0\|<3.3.0` | [Ruby maintenance branches](https://www.ruby-lang.org/en/downloads/branches/) |
| [Ruby 3.1 is end-of-life](../rules/ruby.runtime.eol-3.1.html) | End of life | 2025-03-26 | `vers:gem/>=3.1.0\|<3.2.0` | [Ruby maintenance branches](https://www.ruby-lang.org/en/downloads/branches/) |
| [Ruby 3.0 is end-of-life](../rules/ruby.runtime.eol-3.0.html) | End of life | 2024-04-23 | `vers:gem/>=3.0.0\|<3.1.0` | [Ruby maintenance branches](https://www.ruby-lang.org/en/downloads/branches/) |
| [Ruby 2.7 is end-of-life](../rules/ruby.runtime.eol-2.7.html) | End of life | 2023-03-31 | `vers:gem/>=2.7.0\|<3.0.0` | [Ruby maintenance branches](https://www.ruby-lang.org/en/downloads/branches/) |
| [Ruby 2.6 is end-of-life](../rules/ruby.runtime.eol-2.6.html) | End of life | 2022-04-12 | `vers:gem/>=2.6.0\|<2.7.0` | [Ruby maintenance branches](https://www.ruby-lang.org/en/downloads/branches/) |
| [Ruby 2.5 is end-of-life](../rules/ruby.runtime.eol-2.5.html) | End of life | 2021-04-05 | `vers:gem/>=2.5.0\|<2.6.0` | [Ruby maintenance branches](https://www.ruby-lang.org/en/downloads/branches/) |
| [Ruby 2.4 is end-of-life](../rules/ruby.runtime.eol-2.4.html) | End of life | 2020-03-31 | `vers:gem/>=2.4.0\|<2.5.0` | [Ruby maintenance branches](https://www.ruby-lang.org/en/downloads/branches/) |
| [Ruby 2.3 is end-of-life](../rules/ruby.runtime.eol-2.3.html) | End of life | 2019-03-31 | `vers:gem/>=2.3.0\|<2.4.0` | [Ruby maintenance branches](https://www.ruby-lang.org/en/downloads/branches/) |
| [Ruby 2.2 is end-of-life](../rules/ruby.runtime.eol-2.2.html) | End of life | 2018-03-31 | `vers:gem/>=2.2.0\|<2.3.0` | [Ruby maintenance branches](https://www.ruby-lang.org/en/downloads/branches/) |
| [Ruby 2.1 is end-of-life](../rules/ruby.runtime.eol-2.1.html) | End of life | 2017-03-31 | `vers:gem/>=2.1.0\|<2.2.0` | [Ruby maintenance branches](https://www.ruby-lang.org/en/downloads/branches/) |
| [Ruby 2.0.0 is end-of-life](../rules/ruby.runtime.eol-2.0.0.html) | End of life | 2016-02-24 | `vers:gem/>=2.0.0\|<2.1.0` | [Ruby maintenance branches](https://www.ruby-lang.org/en/downloads/branches/) |
| [Ruby 1.9.3 is end-of-life](../rules/ruby.runtime.eol-1.9.3.html) | End of life | 2015-02-23 | `vers:gem/>=1.9.3\|<2.0.0` | [Ruby maintenance branches](https://www.ruby-lang.org/en/downloads/branches/) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/ruby.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/ruby.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Ruby end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Some Ruby releases are end of life. Ruby 3.2 is end-of-life as of 2026-04-01. This page lists 12 reviewed lifecycle rules for pkg:generic/ruby, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check Ruby?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:generic/ruby."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the Ruby dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
