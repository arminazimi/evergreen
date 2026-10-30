---
title: "Is Erlang end of life? — versions, dates, sources"
description: "Some Erlang releases are end of life. Erlang/OTP 26 no longer receives security updates as of 2026-05-13."
canonical_url: "https://arminazimi.github.io/evergreen/eol/erlang.html"
---

# Is Erlang end of life?

**Some Erlang releases are end of life.** Erlang/OTP 26 no longer receives security updates as of 2026-05-13. This page lists 2 reviewed lifecycle rules for `pkg:generic/erlang`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:generic/erlang
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [Erlang/OTP 26 no longer receives security updates](../rules/elixir.erlang.eol-26.html) | End of life | 2026-05-13 | `vers:semver/>=26.0.0\|<27.0.0` | [Erlang/OTP security policy](https://github.com/erlang/otp/security/policy), [OTP 29.0 release](https://github.com/erlang/otp/releases/tag/OTP-29.0) |
| [Erlang/OTP 25 no longer receives security updates](../rules/elixir.erlang.eol-25.html) | End of life | 2025-05-21 | `vers:semver/>=25.0.0\|<26.0.0` | [Erlang/OTP security policy](https://github.com/erlang/otp/security/policy), [OTP 28.0 release](https://github.com/erlang/otp/releases/tag/OTP-28.0) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/erlang.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/erlang.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Erlang end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Some Erlang releases are end of life. Erlang/OTP 26 no longer receives security updates as of 2026-05-13. This page lists 2 reviewed lifecycle rules for pkg:generic/erlang, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check Erlang?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:generic/erlang."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the Erlang dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
