---
title: "failure is no longer maintained — dates, impact, migration"
description: "The failure crate is officially end-of-life: its former maintainer marked it deprecated and announced there will be no further updates or maintenance."
canonical_url: "https://arminazimi.github.io/evergreen/rules/rust.crate.failure.unmaintained.html"
json_twin: "/rules/rust.crate.failure.unmaintained.json"
---

# failure is no longer maintained

**Deprecated.** The source gives no day. Replacement: anyhow, eyre, fehler, or snafu. Source: [RustSec advisory RUSTSEC-2020-0036](https://rustsec.org/advisories/RUSTSEC-2020-0036.html).

Check a version:

```bash
evergreen check pkg:cargo/failure
```

The failure crate is officially end-of-life: its former maintainer marked it deprecated and announced there will be no further updates or maintenance.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `rust` |
| Component | `pkg:cargo/failure` |
| Affected versions | `vers:cargo/*` |
| Date from the source | The source gives no day |
| Replacement | anyhow, eyre, fehler, or snafu |
| Evidence last seen | 2026-10-17 |
| Reviewed | 2026-10-17 by arminazimi |
| Review due | 2026-12-01 (45 days after the last review) |
| Rule ID | `rust.crate.failure.unmaintained` |

## Sources

- [RustSec advisory RUSTSEC-2020-0036](https://rustsec.org/advisories/RUSTSEC-2020-0036.html)

## Migration

**Constraints**

- Keep error types, `Display` output, and public error conversions stable for callers of this crate.

**Steps**

1. **Replace failure.** Replace failure with anyhow for application errors or thiserror/snafu for library error types, and update `Fail` derives, `failure::Error`, and `format_err!` uses.

**Verification**

- `cargo build --all-targets && cargo test`: Build and test after the error-handling change.

## Detected by

The `rust` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Same ecosystem

- [ansi_term is no longer maintained](rust.crate.ansi-term.unmaintained.html)
- [atty is no longer maintained](rust.crate.atty.unmaintained.html)
- [tempdir is no longer maintained](rust.crate.tempdir.unmaintained.html)
- [Rust 1.98 and older are no longer supported](rust.toolchain.end-of-support-1.98-and-older.html)


## Data

This page is generated from [`registry/rust.json`](https://github.com/arminazimi/evergreen/blob/main/registry/rust.json), rule `rust.crate.failure.unmaintained`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/rust.crate.failure.unmaintained.html",
      "url": "https://arminazimi.github.io/evergreen/rules/rust.crate.failure.unmaintained.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/rust.crate.failure.unmaintained.html",
      "headline": "failure is no longer maintained — dates, impact, migration",
      "description": "The failure crate is officially end-of-life: its former maintainer marked it deprecated and announced there will be no further updates or maintenance.",
      "inLanguage": "en",
      "dateModified": "2026-10-17",
      "keywords": [
        "deprecated",
        "rust",
        "medium"
      ],
      "about": {
        "@type": "Thing",
        "name": "failure is no longer maintained",
        "identifier": "pkg:cargo/failure"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "RustSec advisory RUSTSEC-2020-0036",
          "url": "https://rustsec.org/advisories/RUSTSEC-2020-0036.html"
        }
      ],
      "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/rust.json",
      "publisher": {
        "@type": "Organization",
        "name": "Evergreen",
        "url": "https://arminazimi.github.io/evergreen"
      }
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/rust.crate.failure.unmaintained.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/rust.crate.failure.unmaintained.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:cargo/failure?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated. The source gives no day. Affected versions: vers:cargo/*. Source: RustSec advisory RUSTSEC-2020-0036 (https://rustsec.org/advisories/RUSTSEC-2020-0036.html)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:cargo/failure?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "anyhow, eyre, fehler, or snafu"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:cargo/failure?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:cargo/failure."
          }
        }
      ]
    }
  ]
}
</script>
