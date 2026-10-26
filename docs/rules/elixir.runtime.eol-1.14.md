---
title: "Elixir 1.14 no longer receives security updates — dates, impact, migration"
description: "Elixir's security policy provides security patches only for the five most recent minor branches."
canonical_url: "https://arminazimi.github.io/evergreen/rules/elixir.runtime.eol-1.14.html"
---

# Elixir 1.14 no longer receives security updates

Elixir's security policy provides security patches only for the five most recent minor branches. Elixir 1.14 left that window when Elixir 1.19 shipped on 2025-10-16, so the branch no longer receives security patches from the Elixir project.

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `elixir` |
| Component | `pkg:generic/elixir` |
| Affected versions | `vers:semver/>=1.14.0\|<1.15.0` |
| Date from the source | 2025-10-16 |
| Replacement | Elixir 1.16 or later |
| Evidence last seen | 2026-10-26 |
| Reviewed | 2026-10-26 by arminazimi |
| Review due | 2027-01-24 (90 days after the last review) |
| Rule ID | `elixir.runtime.eol-1.14` |

## Sources

- [Elixir security policy](https://github.com/elixir-lang/elixir/security/policy)
- [Elixir v1.19.0 release](https://github.com/elixir-lang/elixir/releases/tag/v1.19.0)

## Migration

**Constraints**

- Keep .tool-versions, mix.exs elixir:, CI setup-beam versions, and container images on one supported Elixir release line that the chosen Erlang/OTP also supports.
- Confirm Hex dependencies compile on the target Elixir and re-resolve with mix deps.get after changing the runtime.

**Steps**

1. **Raise the Elixir version.** Change the reported declaration from Elixir 1.14 to a supported release (see the replacement), using the project's existing version manager.
2. **Align other Elixir version surfaces.** Update mix.exs elixir:, .tool-versions, CI setup-beam versions, and Dockerfile elixir images so they agree.

**Verification**

- `elixir --version`: Confirm the active Elixir runtime is the intended release.
- `mix deps.get && mix compile`: Re-resolve dependencies and compile on the new Elixir.
- `mix test`: Run the Mix test suite on the new Elixir.

## Detected by

The `elixir` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/elixir.json`](https://github.com/arminazimi/evergreen/blob/main/registry/elixir.json), rule `elixir.runtime.eol-1.14`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/elixir.runtime.eol-1.14.html",
  "url": "https://arminazimi.github.io/evergreen/rules/elixir.runtime.eol-1.14.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/elixir.runtime.eol-1.14.html",
  "headline": "Elixir 1.14 no longer receives security updates — dates, impact, migration",
  "description": "Elixir's security policy provides security patches only for the five most recent minor branches.",
  "inLanguage": "en",
  "dateModified": "2026-10-26",
  "keywords": [
    "end-of-life",
    "elixir",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Elixir 1.14 no longer receives security updates",
    "identifier": "pkg:generic/elixir"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Elixir security policy",
      "url": "https://github.com/elixir-lang/elixir/security/policy"
    },
    {
      "@type": "CreativeWork",
      "name": "Elixir v1.19.0 release",
      "url": "https://github.com/elixir-lang/elixir/releases/tag/v1.19.0"
    }
  ],
  "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/elixir.json",
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen"
  }
}
</script>
