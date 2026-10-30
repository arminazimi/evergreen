---
title: "tempdir is no longer maintained — dates, impact, migration"
description: "The tempdir crate has been deprecated and its functionality merged into tempfile."
canonical_url: "https://arminazimi.github.io/evergreen/rules/rust.crate.tempdir.unmaintained.html"
json_twin: "/rules/rust.crate.tempdir.unmaintained.json"
---

# tempdir is no longer maintained

**Deprecated.** The source gives no day. Replacement: tempfile. Source: [RustSec advisory RUSTSEC-2018-0017](https://rustsec.org/advisories/RUSTSEC-2018-0017.html).

Check a version:

```bash
evergreen check pkg:cargo/tempdir
```

The tempdir crate has been deprecated and its functionality merged into tempfile.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `rust` |
| Component | `pkg:cargo/tempdir` |
| Affected versions | `vers:cargo/*` |
| Date from the source | The source gives no day |
| Replacement | tempfile |
| Evidence last seen | 2026-10-17 |
| Reviewed | 2026-10-17 by arminazimi |
| Review due | 2026-12-01 (45 days after the last review) |
| Rule ID | `rust.crate.tempdir.unmaintained` |

## Sources

- [RustSec advisory RUSTSEC-2018-0017](https://rustsec.org/advisories/RUSTSEC-2018-0017.html)

## Migration

**Constraints**

- Keep temporary directories cleaned up on drop, as before.

**Steps**

1. **Replace tempdir with tempfile.** Replace the tempdir dependency with tempfile and change `TempDir::new(prefix)` calls to `tempfile::tempdir()` or `tempfile::Builder`.

**Verification**

- `cargo build --all-targets && cargo test`: Build and run the tests that create temporary directories.

## Detected by

The `rust` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/rust.json`](https://github.com/arminazimi/evergreen/blob/main/registry/rust.json), rule `rust.crate.tempdir.unmaintained`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/rust.crate.tempdir.unmaintained.html",
      "url": "https://arminazimi.github.io/evergreen/rules/rust.crate.tempdir.unmaintained.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/rust.crate.tempdir.unmaintained.html",
      "headline": "tempdir is no longer maintained — dates, impact, migration",
      "description": "The tempdir crate has been deprecated and its functionality merged into tempfile.",
      "inLanguage": "en",
      "dateModified": "2026-10-17",
      "keywords": [
        "deprecated",
        "rust",
        "medium"
      ],
      "about": {
        "@type": "Thing",
        "name": "tempdir is no longer maintained",
        "identifier": "pkg:cargo/tempdir"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "RustSec advisory RUSTSEC-2018-0017",
          "url": "https://rustsec.org/advisories/RUSTSEC-2018-0017.html"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/rust.crate.tempdir.unmaintained.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/rust.crate.tempdir.unmaintained.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:cargo/tempdir?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated. The source gives no day. Affected versions: vers:cargo/*. Source: RustSec advisory RUSTSEC-2018-0017 (https://rustsec.org/advisories/RUSTSEC-2018-0017.html)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:cargo/tempdir?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "tempfile"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:cargo/tempdir?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:cargo/tempdir."
          }
        }
      ]
    }
  ]
}
</script>
