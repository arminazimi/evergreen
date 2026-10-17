---
title: "atty is no longer maintained — dates, impact, migration"
description: "The maintainer of atty has published an official notice that the crate is no longer under development and that users should rely on the standard library's IsTerminal trait."
canonical_url: "https://arminazimi.github.io/evergreen/rules/rust.crate.atty.unmaintained.html"
---

# atty is no longer maintained

The maintainer of atty has published an official notice that the crate is no longer under development and that users should rely on the standard library's IsTerminal trait.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `rust` |
| Component | `pkg:cargo/atty` |
| Affected versions | `vers:cargo/*` |
| Date from the source | The source gives no day |
| Replacement | std::io::IsTerminal (stable since Rust 1.70), or the is-terminal crate for older compilers |
| Evidence last seen | 2026-10-17 |
| Reviewed | 2026-10-17 by arminazimi |
| Review due | 2026-12-01 (45 days after the last review) |
| Rule ID | `rust.crate.atty.unmaintained` |

## Sources

- [RustSec advisory RUSTSEC-2024-0375](https://rustsec.org/advisories/RUSTSEC-2024-0375.html)

## Migration

**Constraints**

- Preserve how colored or interactive output is chosen when stdout or stderr is not a terminal.

**Steps**

1. **Use std::io::IsTerminal.** Replace `atty::is(Stream::Stdout)` with `std::io::stdout().is_terminal()` (stable since Rust 1.70, `use std::io::IsTerminal`), or use the is-terminal crate on older compilers, and remove the atty dependency.

**Verification**

- `cargo build --all-targets && cargo test`: Build and test after removing atty.

## Detected by

The `rust` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/rust.json`](https://github.com/arminazimi/evergreen/blob/main/registry/rust.json), rule `rust.crate.atty.unmaintained`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/rust.crate.atty.unmaintained.html",
  "url": "https://arminazimi.github.io/evergreen/rules/rust.crate.atty.unmaintained.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/rust.crate.atty.unmaintained.html",
  "headline": "atty is no longer maintained — dates, impact, migration",
  "description": "The maintainer of atty has published an official notice that the crate is no longer under development and that users should rely on the standard library's IsTerminal trait.",
  "inLanguage": "en",
  "dateModified": "2026-10-17",
  "keywords": [
    "deprecated",
    "rust",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "atty is no longer maintained",
    "identifier": "pkg:cargo/atty"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "RustSec advisory RUSTSEC-2024-0375",
      "url": "https://rustsec.org/advisories/RUSTSEC-2024-0375.html"
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
