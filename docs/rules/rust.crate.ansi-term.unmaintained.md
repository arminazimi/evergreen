---
title: "ansi_term is no longer maintained"
description: "The maintainer has advised that ansi_term is deprecated and will not receive any maintenance."
---

# ansi_term is no longer maintained

The maintainer has advised that ansi_term is deprecated and will not receive any maintenance.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `rust` |
| Component | `pkg:cargo/ansi_term` |
| Affected versions | `vers:cargo/*` |
| Date from the source | The source gives no day |
| Replacement | A maintained terminal-styling crate (the advisory lists unvetted alternatives such as anstyle, nu-ansi-term, owo-colors, and console) |
| Evidence last seen | 2026-10-17 |
| Reviewed | 2026-10-17 by arminazimi |
| Review due | 2026-12-01 (45 days after the last review) |
| Rule ID | `rust.crate.ansi-term.unmaintained` |

## Sources

- [RustSec advisory RUSTSEC-2021-0139](https://rustsec.org/advisories/RUSTSEC-2021-0139.html)

## Migration

**Constraints**

- Keep the same colors and styles in terminal output.

**Steps**

1. **Replace ansi_term.** Replace ansi_term with a maintained styling crate (the advisory lists anstyle, nu-ansi-term, owo-colors, and console as unvetted options) and update `Style`, `Colour`, and `ANSIString` uses.

**Verification**

- `cargo build --all-targets && cargo test`: Build and test after the styling change.

## Detected by

The `rust` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/rust.json`](https://github.com/arminazimi/evergreen/blob/main/registry/rust.json), rule `rust.crate.ansi-term.unmaintained`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/rust.crate.ansi-term.unmaintained.html",
  "url": "https://arminazimi.github.io/evergreen/rules/rust.crate.ansi-term.unmaintained.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/rust.crate.ansi-term.unmaintained.html",
  "headline": "ansi_term is no longer maintained",
  "description": "The maintainer has advised that ansi_term is deprecated and will not receive any maintenance.",
  "inLanguage": "en",
  "dateModified": "2026-10-17",
  "keywords": [
    "deprecated",
    "rust",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "ansi_term is no longer maintained",
    "identifier": "pkg:cargo/ansi_term"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "RustSec advisory RUSTSEC-2021-0139",
      "url": "https://rustsec.org/advisories/RUSTSEC-2021-0139.html"
    }
  ],
  "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/rust.json",
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen"
  }
}
</script>
