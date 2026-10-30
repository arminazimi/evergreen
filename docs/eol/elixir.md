---
title: "Is Elixir end of life? — versions, dates, sources"
description: "Some Elixir releases are end of life. Elixir 1.15 no longer receives security updates as of 2026-06-03."
canonical_url: "https://arminazimi.github.io/evergreen/eol/elixir.html"
---

# Is Elixir end of life?

**Some Elixir releases are end of life.** Elixir 1.15 no longer receives security updates as of 2026-06-03. This page lists 2 reviewed lifecycle rules for `pkg:generic/elixir`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:generic/elixir
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [Elixir 1.15 no longer receives security updates](../rules/elixir.runtime.eol-1.15.html) | End of life | 2026-06-03 | `vers:semver/>=1.15.0\|<1.16.0` | [Elixir security policy](https://github.com/elixir-lang/elixir/security/policy), [Elixir v1.20.0 release](https://github.com/elixir-lang/elixir/releases/tag/v1.20.0) |
| [Elixir 1.14 no longer receives security updates](../rules/elixir.runtime.eol-1.14.html) | End of life | 2025-10-16 | `vers:semver/>=1.14.0\|<1.15.0` | [Elixir security policy](https://github.com/elixir-lang/elixir/security/policy), [Elixir v1.19.0 release](https://github.com/elixir-lang/elixir/releases/tag/v1.19.0) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/elixir.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/elixir.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Elixir end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Some Elixir releases are end of life. Elixir 1.15 no longer receives security updates as of 2026-06-03. This page lists 2 reviewed lifecycle rules for pkg:generic/elixir, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check Elixir?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:generic/elixir."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the Elixir dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
