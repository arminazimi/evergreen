---
title: "Interpolation-only strings are deprecated — dates, impact, migration"
description: "Terraform v0.12.14 deprecated a string whose whole value is one interpolation, such as \"${var.name}\": the same value is written as the bare expression var.name."
layout: doc
permalink: "/rules/terraform.syntax.interpolation-only.html"
canonical_url: "https://arminazimi.github.io/evergreen/rules/terraform.syntax.interpolation-only.html"
image: "/assets/og/terraform.syntax.interpolation-only.svg"
review_date: "2026-10-31"
last_modified_at: "2026-10-31"
json_twin: "/rules/terraform.syntax.interpolation-only.json"
---

# Interpolation-only strings are deprecated

**Deprecated.** The source gives no day. Replacement: The same expression without the surrounding quotes, such as var.name. Source: [hashicorp/terraform release v0.12.14](https://github.com/hashicorp/terraform/releases/tag/v0.12.14).

Check a version:

```bash
evergreen check pkg:generic/terraform
```

Terraform v0.12.14 deprecated a string whose whole value is one interpolation, such as "${var.name}": the same value is written as the bare expression var.name. Terraform still accepts the quoted form but recommends the bare expression for readability, and terraform fmt repairs simple examples. A string that mixes text with an interpolation, such as "prefix-${var.name}", is not the deprecated form and still needs its quotes.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | low |
| Ecosystem | `terraform` |
| Component | `pkg:generic/terraform` |
| Affected versions | `vers:semver/>=0.12.14` |
| Date from the source | The source gives no day |
| Replacement | The same expression without the surrounding quotes, such as var.name |
| Evidence last seen | 2026-10-31 |
| Reviewed | 2026-10-31 by arminazimi |
| Review due | 2027-01-29 (90 days after the last review) |
| Rule ID | `terraform.syntax.interpolation-only` |

## Sources

- [hashicorp/terraform release v0.12.14](https://github.com/hashicorp/terraform/releases/tag/v0.12.14) (accessed 2026-10-31)
- [Terraform 0.15 upgrade guide: legacy configuration language features](https://developer.hashicorp.com/terraform/language/v1.1.x/upgrade-guides/0-15) (accessed 2026-10-31)
- [Terraform 0.12 upgrade guide: first-class expressions](https://developer.hashicorp.com/terraform/language/v1.1.x/upgrade-guides/0-12) (accessed 2026-10-31)

## Migration

**Constraints**

- Rewrite only a string whose entire value is one ${ ... } interpolation. A string with any literal text, a %{ ... } directive, or an escape sequence must keep its quotes.
- Do not remove the quotes from an object key or a block label: those strings are not expressions, and the bare form would not be valid HCL.
- Each rewrite is a syntactic one-to-one change with the same expression inside the interpolation, so plan output should not change.

**Steps**

1. **Replace the quoted interpolation with its expression.** Change `value = "${var.name}"` to `value = var.name`, keeping the expression exactly as written inside the interpolation.
2. **Repair the other interpolation-only strings.** Repeat for every string in *.tf that contains exactly one interpolation and no other text. Run terraform fmt to catch simple examples the codemod did not rewrite.

**Verification**

- `terraform init -backend=false && terraform validate`: Initialize without touching remote state and check that the rewritten expressions are valid HCL.
- `terraform plan`: Confirm the rewrite evaluates to the same values and the plan is unchanged.

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

This page is generated from [`registry/terraform.json`](https://github.com/arminazimi/evergreen/blob/main/registry/terraform.json), rule `terraform.syntax.interpolation-only`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/terraform.syntax.interpolation-only.html",
      "url": "https://arminazimi.github.io/evergreen/rules/terraform.syntax.interpolation-only.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/terraform.syntax.interpolation-only.html",
      "headline": "Interpolation-only strings are deprecated — dates, impact, migration",
      "description": "Terraform v0.12.14 deprecated a string whose whole value is one interpolation, such as \"${var.name}\": the same value is written as the bare expression var.name.",
      "inLanguage": "en",
      "dateModified": "2026-10-31",
      "keywords": [
        "deprecated",
        "terraform",
        "low"
      ],
      "about": {
        "@type": "Thing",
        "name": "Interpolation-only strings are deprecated",
        "identifier": "pkg:generic/terraform"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "hashicorp/terraform release v0.12.14",
          "url": "https://github.com/hashicorp/terraform/releases/tag/v0.12.14"
        },
        {
          "@type": "CreativeWork",
          "name": "Terraform 0.15 upgrade guide: legacy configuration language features",
          "url": "https://developer.hashicorp.com/terraform/language/v1.1.x/upgrade-guides/0-15"
        },
        {
          "@type": "CreativeWork",
          "name": "Terraform 0.12 upgrade guide: first-class expressions",
          "url": "https://developer.hashicorp.com/terraform/language/v1.1.x/upgrade-guides/0-12"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/terraform.syntax.interpolation-only.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/terraform.syntax.interpolation-only.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/terraform?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated. The source gives no day. Affected versions: vers:semver/>=0.12.14. Source: hashicorp/terraform release v0.12.14 (https://github.com/hashicorp/terraform/releases/tag/v0.12.14)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/terraform?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The same expression without the surrounding quotes, such as var.name"
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
