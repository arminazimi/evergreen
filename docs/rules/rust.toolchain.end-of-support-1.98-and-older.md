---
title: "Rust 1.98 and older are no longer supported — dates, impact, migration"
description: "The Rust project only provides support and security updates for the most recent stable release, so a release line is unsupported once the next stable release ships."
canonical_url: "https://arminazimi.github.io/evergreen/rules/rust.toolchain.end-of-support-1.98-and-older.html"
---

# Rust 1.98 and older are no longer supported

The Rust project only provides support and security updates for the most recent stable release, so a release line is unsupported once the next stable release ships. Rust 1.99 was released on 2026-10-01.

| | |
| --- | --- |
| Status | End of support |
| Severity | medium |
| Ecosystem | `rust` |
| Component | `pkg:generic/rust` |
| Affected versions | `vers:semver/<1.99.0` |
| Date from the source | 2026-10-01 |
| Replacement | The latest stable Rust release |
| Evidence last seen | 2026-10-17 |
| Reviewed | 2026-10-17 by arminazimi |
| Review due | 2026-12-01 (45 days after the last review) |
| Rule ID | `rust.toolchain.end-of-support-1.98-and-older` |

## Sources

- [Rust security policy](https://www.rust-lang.org/policies/security)
- [Rust release notes (release dates)](https://github.com/rust-lang/rust/blob/master/RELEASES.md)

## Migration

**Constraints**

- Keep the toolchain in rust-toolchain(.toml), CI (for example dtolnay/rust-toolchain or rustup), and container images on one supported release.
- Check the project's MSRV (`rust-version`) separately: raising the toolchain does not require raising it.

**Steps**

1. **Raise the pinned toolchain.** Change the reported channel in rust-toolchain(.toml) to the latest stable release, or to `stable`, so the project follows supported releases.
2. **Align other toolchain surfaces.** Update CI toolchain setup and Dockerfile `rust:` images so they match the new release.

**Verification**

- `rustc --version`: Confirm the active toolchain is the intended release.
- `cargo build --all-targets && cargo test`: Build and test every target on the new toolchain.
- `cargo clippy --all-targets`: Review the lints the newer toolchain reports.

## Detected by

The `rust` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/rust.json`](https://github.com/arminazimi/evergreen/blob/main/registry/rust.json), rule `rust.toolchain.end-of-support-1.98-and-older`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/rust.toolchain.end-of-support-1.98-and-older.html",
  "url": "https://arminazimi.github.io/evergreen/rules/rust.toolchain.end-of-support-1.98-and-older.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/rust.toolchain.end-of-support-1.98-and-older.html",
  "headline": "Rust 1.98 and older are no longer supported — dates, impact, migration",
  "description": "The Rust project only provides support and security updates for the most recent stable release, so a release line is unsupported once the next stable release ships.",
  "inLanguage": "en",
  "dateModified": "2026-10-17",
  "keywords": [
    "end-of-support",
    "rust",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "Rust 1.98 and older are no longer supported",
    "identifier": "pkg:generic/rust"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Rust security policy",
      "url": "https://www.rust-lang.org/policies/security"
    },
    {
      "@type": "CreativeWork",
      "name": "Rust release notes (release dates)",
      "url": "https://github.com/rust-lang/rust/blob/master/RELEASES.md"
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
