---
title: "Erlang/OTP 26 no longer receives security updates — dates, impact, migration"
description: "Erlang/OTP supports the last three major releases with security updates. OTP 26 left that window when OTP 29 shipped on 2026-05-13, so the release no longer receives security updates from the…"
canonical_url: "https://arminazimi.github.io/evergreen/rules/elixir.erlang.eol-26.html"
json_twin: "/rules/elixir.erlang.eol-26.json"
---

# Erlang/OTP 26 no longer receives security updates

**End of life** as of 2026-05-13. Replacement: Erlang/OTP 27 or later. Source: [Erlang/OTP security policy](https://github.com/erlang/otp/security/policy).

Check a version:

```bash
evergreen check pkg:generic/erlang
```

Erlang/OTP supports the last three major releases with security updates. OTP 26 left that window when OTP 29 shipped on 2026-05-13, so the release no longer receives security updates from the Erlang/OTP project.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `elixir` |
| Component | `pkg:generic/erlang` |
| Affected versions | `vers:semver/>=26.0.0\|<27.0.0` |
| Date from the source | 2026-05-13 |
| Replacement | Erlang/OTP 27 or later |
| Evidence last seen | 2026-10-26 |
| Reviewed | 2026-10-26 by arminazimi |
| Review due | 2027-01-24 (90 days after the last review) |
| Rule ID | `elixir.erlang.eol-26` |

## Sources

- [Erlang/OTP security policy](https://github.com/erlang/otp/security/policy)
- [OTP 29.0 release](https://github.com/erlang/otp/releases/tag/OTP-29.0)

## Migration

**Constraints**

- Keep .tool-versions erlang pins, asdf elixir …-otp-N suffixes, CI setup-beam OTP versions, and container images on one supported OTP release that the project's Elixir supports.
- Confirm Mix dependencies and NIFs build on the target OTP and recompile after changing the runtime.

**Steps**

1. **Raise the Erlang/OTP version.** Change the reported declaration from OTP 26 to a supported release (see the replacement), using the project's existing version manager.
2. **Align other OTP version surfaces.** Update .tool-versions, asdf elixir …-otp-N pins, CI setup-beam OTP versions, and Dockerfile erlang images so they agree.

**Verification**

- `erl -eval 'erlang:display(erlang:system_info(otp_release)), halt().' -noshell`: Confirm the active OTP release is the intended major.
- `mix deps.get && mix compile`: Re-resolve dependencies and compile on the new OTP.
- `mix test`: Run the Mix test suite on the new OTP.

## Detected by

The `elixir` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/elixir.json`](https://github.com/arminazimi/evergreen/blob/main/registry/elixir.json), rule `elixir.erlang.eol-26`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/elixir.erlang.eol-26.html",
      "url": "https://arminazimi.github.io/evergreen/rules/elixir.erlang.eol-26.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/elixir.erlang.eol-26.html",
      "headline": "Erlang/OTP 26 no longer receives security updates — dates, impact, migration",
      "description": "Erlang/OTP supports the last three major releases with security updates. OTP 26 left that window when OTP 29 shipped on 2026-05-13, so the release no longer receives security updates from the…",
      "inLanguage": "en",
      "dateModified": "2026-10-26",
      "keywords": [
        "end-of-life",
        "elixir",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "Erlang/OTP 26 no longer receives security updates",
        "identifier": "pkg:generic/erlang"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Erlang/OTP security policy",
          "url": "https://github.com/erlang/otp/security/policy"
        },
        {
          "@type": "CreativeWork",
          "name": "OTP 29.0 release",
          "url": "https://github.com/erlang/otp/releases/tag/OTP-29.0"
        }
      ],
      "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/elixir.json",
      "publisher": {
        "@type": "Organization",
        "name": "Evergreen",
        "url": "https://arminazimi.github.io/evergreen"
      }
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/elixir.erlang.eol-26.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/elixir.erlang.eol-26.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/erlang?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life as of 2026-05-13. Affected versions: vers:semver/>=26.0.0|\u003c27.0.0. Source: Erlang/OTP security policy (https://github.com/erlang/otp/security/policy)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/erlang?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Erlang/OTP 27 or later"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/erlang?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/erlang."
          }
        }
      ]
    }
  ]
}
</script>
