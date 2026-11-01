---
title: "The list() and map() functions were removed in Terraform 0.15 — dates, impact, migration"
description: "Terraform v0.12 replaced the list() and map() functions with first-class [ ... ] and { ... } syntax, and the v0.15 upgrade guide states that the deprecated functions were removed in v0.15."
layout: doc
permalink: "/rules/terraform.function.list-map.html"
canonical_url: "https://arminazimi.github.io/evergreen/rules/terraform.function.list-map.html"
image: "/assets/og/terraform.function.list-map.svg"
review_date: "2026-10-31"
last_modified_at: "2026-10-31"
json_twin: "/rules/terraform.function.list-map.json"
---

# The list() and map() functions were removed in Terraform 0.15

**Removed.** The source gives no day. Replacement: tolist([ ... ]) for list(), tomap({ ... }) for map(). Source: [Terraform 0.15 upgrade guide: legacy configuration language features](https://developer.hashicorp.com/terraform/language/v1.1.x/upgrade-guides/0-15).

Check a version:

```bash
evergreen check pkg:generic/terraform
```

Terraform v0.12 replaced the list() and map() functions with first-class [ ... ] and { ... } syntax, and the v0.15 upgrade guide states that the deprecated functions were removed in v0.15. Replace list(a, b) with tolist([a, b]) and map(k, v) with tomap({ k = v }); because Terraform can usually infer the type from context, the bare [ ... ] and { ... } forms often work without the conversion. The list(string) and map(string) type constraints are different and remain valid.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Removed |
| Severity | high |
| Ecosystem | `terraform` |
| Component | `pkg:generic/terraform` |
| Affected versions | `vers:semver/>=0.15.0` |
| Date from the source | The source gives no day |
| Replacement | tolist([ ... ]) for list(), tomap({ ... }) for map() |
| Evidence last seen | 2026-10-31 |
| Reviewed | 2026-10-31 by arminazimi |
| Review due | 2027-01-29 (90 days after the last review) |
| Rule ID | `terraform.function.list-map` |

## Sources

- [Terraform 0.15 upgrade guide: legacy configuration language features](https://developer.hashicorp.com/terraform/language/v1.1.x/upgrade-guides/0-15) (accessed 2026-10-31)
- [Terraform tolist function](https://developer.hashicorp.com/terraform/language/functions/tolist) (accessed 2026-10-31)
- [Terraform tomap function](https://developer.hashicorp.com/terraform/language/functions/tomap) (accessed 2026-10-31)

## Migration

**Constraints**

- Do not rewrite a type constraint: `type = list(string)` and `type = map(object({...}))` are type constructors that still exist in Terraform 0.15 and later.
- Rewrite a call only when every argument is on one line and the argument count is meaningful: list() needs at least one value, and map() needs an even number of key/value arguments.
- In a map() call, write each key as an identifier or a quoted string; a bare expression key does not have the same meaning in an object constructor.

**Steps**

1. **Replace the removed calls.** Change `list(a, b)` to `tolist([a, b])` and `map("k", v)` to `tomap({ k = v })`. When the surrounding context already fixes the type, the bare `[a, b]` and `{ k = v }` forms are also correct.
2. **Find the calls left in other files.** Search *.tf for `list(` and `map(` outside variable type constraints, and rewrite the value calls the same way. Leave `list(string)`, `map(string)`, and other type constructors unchanged.

**Verification**

- `terraform init -backend=false && terraform validate`: Initialize without touching remote state and check that no removed function is left.
- `terraform plan`: Confirm the collection types and values are unchanged apart from the rewrite.

## Detected by

The `terraform` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Same ecosystem

- [AKS 1.28 and earlier are no longer supported](terraform.aks.end-of-life-1.28-and-older.html)
- [AKS 1.29 is past long-term support](terraform.aks.end-of-life-1.29.html)
- [AKS 1.30 is past long-term support](terraform.aks.end-of-life-1.30.html)
- [AKS 1.31 is past its 12-month support window](terraform.aks.end-of-support-1.31.html)
- [AKS 1.32 is past its 12-month support window](terraform.aks.end-of-support-1.32.html)
- [AKS 1.33 is past its 12-month support window](terraform.aks.end-of-support-1.33.html)
- [Terraform CLI 1.10 is no longer a supported release line](terraform.cli.end-of-support-1.10.html)
- [Terraform CLI 1.11 is no longer a supported release line](terraform.cli.end-of-support-1.11.html)


## Data

This page is generated from [`registry/terraform.json`](https://github.com/arminazimi/evergreen/blob/main/registry/terraform.json), rule `terraform.function.list-map`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/terraform.function.list-map.html",
      "url": "https://arminazimi.github.io/evergreen/rules/terraform.function.list-map.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/terraform.function.list-map.html",
      "headline": "The list() and map() functions were removed in Terraform 0.15 — dates, impact, migration",
      "description": "Terraform v0.12 replaced the list() and map() functions with first-class [ ... ] and { ... } syntax, and the v0.15 upgrade guide states that the deprecated functions were removed in v0.15.",
      "inLanguage": "en",
      "dateModified": "2026-10-31",
      "keywords": [
        "removed",
        "terraform",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "The list() and map() functions were removed in Terraform 0.15",
        "identifier": "pkg:generic/terraform"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Terraform 0.15 upgrade guide: legacy configuration language features",
          "url": "https://developer.hashicorp.com/terraform/language/v1.1.x/upgrade-guides/0-15"
        },
        {
          "@type": "CreativeWork",
          "name": "Terraform tolist function",
          "url": "https://developer.hashicorp.com/terraform/language/functions/tolist"
        },
        {
          "@type": "CreativeWork",
          "name": "Terraform tomap function",
          "url": "https://developer.hashicorp.com/terraform/language/functions/tomap"
        }
      ],
      "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/terraform.json",
      "publisher": {
        "@type": "Organization",
        "name": "Evergreen",
        "url": "https://arminazimi.github.io/evergreen"
      }
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/terraform.function.list-map.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/terraform.function.list-map.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/terraform?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Removed. The source gives no day. Affected versions: vers:semver/>=0.15.0. Source: Terraform 0.15 upgrade guide: legacy configuration language features (https://developer.hashicorp.com/terraform/language/v1.1.x/upgrade-guides/0-15)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/terraform?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "tolist([ ... ]) for list(), tomap({ ... }) for map()"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/terraform?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/terraform."
          }
        }
      ]
    }
  ]
}
</script>
