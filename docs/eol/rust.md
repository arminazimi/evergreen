---
title: "Is Rust end of life? — versions, dates, sources"
description: "Rust has releases that are out of support. Rust 1.98 and older are no longer supported as of 2026-10-01."
canonical_url: "https://arminazimi.github.io/evergreen/eol/rust.html"
---

# Is Rust end of life?

**Rust has releases that are out of support.** Rust 1.98 and older are no longer supported as of 2026-10-01. This page lists 1 reviewed lifecycle rule for `pkg:generic/rust`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:generic/rust
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [Rust 1.98 and older are no longer supported](../rules/rust.toolchain.end-of-support-1.98-and-older.html) | End of support | 2026-10-01 | `vers:semver/<1.99.0` | [Rust security policy](https://www.rust-lang.org/policies/security), [Rust release notes (release dates)](https://github.com/rust-lang/rust/blob/master/RELEASES.md) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/rust.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/rust.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Rust end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Rust has releases that are out of support. Rust 1.98 and older are no longer supported as of 2026-10-01. This page lists 1 reviewed lifecycle rule for pkg:generic/rust, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check Rust?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:generic/rust."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the Rust dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
