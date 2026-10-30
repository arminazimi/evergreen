---
title: "Terraform CLI 1.14 is no longer a supported release line — dates, impact, migration"
description: "HashiCorp supports the two most recent Terraform release lines. Terraform 1.14 (first released 2025-11-19) stopped being one of them when Terraform 1.16 was released on 2026-08-26."
canonical_url: "https://arminazimi.github.io/evergreen/rules/terraform.cli.end-of-support-1.14.html"
json_twin: "/rules/terraform.cli.end-of-support-1.14.json"
---

# Terraform CLI 1.14 is no longer a supported release line

**End of support** as of 2026-08-26. Replacement: Terraform 1.15 or later. Source: [endoflife.date: Terraform](https://endoflife.date/terraform).

Check a version:

```bash
evergreen check pkg:generic/terraform
```

HashiCorp supports the two most recent Terraform release lines. Terraform 1.14 (first released 2025-11-19) stopped being one of them when Terraform 1.16 was released on 2026-08-26. endoflife.date records 2026-08-26 as the end-of-life date for the 1.14 line. The HashiCorp support policy page could not be read when this rule was reviewed, so the support window is taken from the endoflife.date record and the dates of the hashicorp/terraform GitHub releases.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `terraform` |
| Component | `pkg:generic/terraform` |
| Affected versions | `vers:semver/>=1.14.0\|<1.15.0` |
| Date from the source | 2026-08-26 |
| Replacement | Terraform 1.15 or later |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-01-19 (90 days after the last review) |
| Rule ID | `terraform.cli.end-of-support-1.14` |

## Sources

- [endoflife.date: Terraform](https://endoflife.date/terraform)
- [hashicorp/terraform release v1.16.0](https://github.com/hashicorp/terraform/releases/tag/v1.16.0)
- [HashiCorp Terraform support policy](https://support.hashicorp.com/hc/en-us/articles/360021185113)

## Migration

**Constraints**

- Keep required_version in *.tf, the pin in .terraform-version or .tool-versions, and the Terraform version installed in CI and by every teammate on one supported release line.
- Terraform state written by a newer release may not be readable by an older one, so move every place that runs plan or apply together instead of one environment at a time.
- Do not run terraform init -upgrade as part of this change unless provider upgrades are intended: it can change provider versions and rewrite .terraform.lock.hcl.

**Steps**

1. **Raise the Terraform CLI pin.** Change the reported .terraform-version or terraform entry in .tool-versions to the release in the replacement.
2. **Raise required_version.** Raise the lower bound of required_version in the terraform block of each *.tf file so it admits only supported releases, and read the upgrade notes of every line you cross.
3. **Align CI and documentation.** Update CI workflows, Docker images, and setup documentation that install Terraform (for example hashicorp/setup-terraform) so they match the new pin.

**Verification**

- `terraform version`: Confirm the active Terraform CLI is the intended release.
- `terraform init -backend=false && terraform validate`: Initialize without touching remote state and check that the configuration is valid on the new release.
- `terraform plan`: Review the plan and confirm the upgrade introduces no unexpected changes.

## Detected by

The `terraform` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Other versions of this product

- [Terraform CLI 1.10 is no longer a supported release line](terraform.cli.end-of-support-1.10.html)
- [Terraform CLI 1.11 is no longer a supported release line](terraform.cli.end-of-support-1.11.html)
- [Terraform CLI 1.12 is no longer a supported release line](terraform.cli.end-of-support-1.12.html)
- [Terraform CLI 1.13 is no longer a supported release line](terraform.cli.end-of-support-1.13.html)
- [Terraform CLI 1.15 is no longer a supported release line](terraform.cli.end-of-support-1.15.html)

### Same ecosystem

- [AKS 1.28 and earlier are no longer supported](terraform.aks.end-of-life-1.28-and-older.html)
- [AKS 1.29 is past long-term support](terraform.aks.end-of-life-1.29.html)
- [AKS 1.30 is past long-term support](terraform.aks.end-of-life-1.30.html)
- [AKS 1.31 is past its 12-month support window](terraform.aks.end-of-support-1.31.html)
- [AKS 1.32 is past its 12-month support window](terraform.aks.end-of-support-1.32.html)
- [AKS 1.33 is past its 12-month support window](terraform.aks.end-of-support-1.33.html)
- [Amazon EKS 1.30 and earlier are past end of extended support](terraform.eks.end-of-life-1.30-and-older.html)
- [Amazon EKS 1.31 is past end of standard support](terraform.eks.end-of-support-1.31.html)


## Data

This page is generated from [`registry/terraform.json`](https://github.com/arminazimi/evergreen/blob/main/registry/terraform.json), rule `terraform.cli.end-of-support-1.14`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/terraform.cli.end-of-support-1.14.html",
      "url": "https://arminazimi.github.io/evergreen/rules/terraform.cli.end-of-support-1.14.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/terraform.cli.end-of-support-1.14.html",
      "headline": "Terraform CLI 1.14 is no longer a supported release line — dates, impact, migration",
      "description": "HashiCorp supports the two most recent Terraform release lines. Terraform 1.14 (first released 2025-11-19) stopped being one of them when Terraform 1.16 was released on 2026-08-26.",
      "inLanguage": "en",
      "dateModified": "2026-10-21",
      "keywords": [
        "end-of-support",
        "terraform",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "Terraform CLI 1.14 is no longer a supported release line",
        "identifier": "pkg:generic/terraform"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "endoflife.date: Terraform",
          "url": "https://endoflife.date/terraform"
        },
        {
          "@type": "CreativeWork",
          "name": "hashicorp/terraform release v1.16.0",
          "url": "https://github.com/hashicorp/terraform/releases/tag/v1.16.0"
        },
        {
          "@type": "CreativeWork",
          "name": "HashiCorp Terraform support policy",
          "url": "https://support.hashicorp.com/hc/en-us/articles/360021185113"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/terraform.cli.end-of-support-1.14.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/terraform.cli.end-of-support-1.14.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/terraform?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of support as of 2026-08-26. Affected versions: vers:semver/>=1.14.0|\u003c1.15.0. Source: endoflife.date: Terraform (https://endoflife.date/terraform)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/terraform?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Terraform 1.15 or later"
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
