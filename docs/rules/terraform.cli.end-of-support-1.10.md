---
title: "Terraform CLI 1.10 is no longer a supported release line — dates, impact, migration"
description: "HashiCorp supports the two most recent Terraform release lines. Terraform 1.10 (first released 2024-11-26) stopped being one of them when Terraform 1.12 was released on 2025-05-14."
canonical_url: "https://arminazimi.github.io/evergreen/rules/terraform.cli.end-of-support-1.10.html"
image: "/assets/og/terraform.cli.end-of-support-1.10.svg"
json_twin: "/rules/terraform.cli.end-of-support-1.10.json"
---

# Terraform CLI 1.10 is no longer a supported release line

**End of support** as of 2025-05-14. Replacement: Terraform 1.15 or later. Source: [endoflife.date: Terraform](https://endoflife.date/terraform).

Check a version:

```bash
evergreen check pkg:generic/terraform
```

HashiCorp supports the two most recent Terraform release lines. Terraform 1.10 (first released 2024-11-26) stopped being one of them when Terraform 1.12 was released on 2025-05-14. endoflife.date records 2025-05-14 as the end-of-life date for the 1.10 line. The HashiCorp support policy page could not be read when this rule was reviewed, so the support window is taken from the endoflife.date record and the dates of the hashicorp/terraform GitHub releases.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of support |
| Severity | medium |
| Ecosystem | `terraform` |
| Component | `pkg:generic/terraform` |
| Affected versions | `vers:semver/>=1.10.0\|<1.11.0` |
| Date from the source | 2025-05-14 |
| Replacement | Terraform 1.15 or later |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-01-19 (90 days after the last review) |
| Rule ID | `terraform.cli.end-of-support-1.10` |

## Sources

- [endoflife.date: Terraform](https://endoflife.date/terraform)
- [hashicorp/terraform release v1.12.0](https://github.com/hashicorp/terraform/releases/tag/v1.12.0)
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

## Data

This page is generated from [`registry/terraform.json`](https://github.com/arminazimi/evergreen/blob/main/registry/terraform.json), rule `terraform.cli.end-of-support-1.10`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/terraform.cli.end-of-support-1.10.html",
      "url": "https://arminazimi.github.io/evergreen/rules/terraform.cli.end-of-support-1.10.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/terraform.cli.end-of-support-1.10.html",
      "headline": "Terraform CLI 1.10 is no longer a supported release line — dates, impact, migration",
      "description": "HashiCorp supports the two most recent Terraform release lines. Terraform 1.10 (first released 2024-11-26) stopped being one of them when Terraform 1.12 was released on 2025-05-14.",
      "inLanguage": "en",
      "dateModified": "2026-10-21",
      "keywords": [
        "end-of-support",
        "terraform",
        "medium"
      ],
      "about": {
        "@type": "Thing",
        "name": "Terraform CLI 1.10 is no longer a supported release line",
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
          "name": "hashicorp/terraform release v1.12.0",
          "url": "https://github.com/hashicorp/terraform/releases/tag/v1.12.0"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/terraform.cli.end-of-support-1.10.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/terraform.cli.end-of-support-1.10.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/terraform?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of support as of 2025-05-14. Affected versions: vers:semver/>=1.10.0|\u003c1.11.0. Source: endoflife.date: Terraform (https://endoflife.date/terraform)."
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
