---
title: "Terraform CLI 1.11 is no longer a supported release line — dates, impact, migration"
description: "HashiCorp supports the two most recent Terraform release lines. Terraform 1.11 (first released 2025-02-27) stopped being one of them when Terraform 1.13 was released on 2025-08-20."
canonical_url: "https://arminazimi.github.io/evergreen/rules/terraform.cli.end-of-support-1.11.html"
json_twin: "/rules/terraform.cli.end-of-support-1.11.json"
---

# Terraform CLI 1.11 is no longer a supported release line

HashiCorp supports the two most recent Terraform release lines. Terraform 1.11 (first released 2025-02-27) stopped being one of them when Terraform 1.13 was released on 2025-08-20. endoflife.date records 2025-08-20 as the end-of-life date for the 1.11 line. The HashiCorp support policy page could not be read when this rule was reviewed, so the support window is taken from the endoflife.date record and the dates of the hashicorp/terraform GitHub releases.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of support |
| Severity | medium |
| Ecosystem | `terraform` |
| Component | `pkg:generic/terraform` |
| Affected versions | `vers:semver/>=1.11.0\|<1.12.0` |
| Date from the source | 2025-08-20 |
| Replacement | Terraform 1.15 or later |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-01-19 (90 days after the last review) |
| Rule ID | `terraform.cli.end-of-support-1.11` |

## Sources

- [endoflife.date: Terraform](https://endoflife.date/terraform)
- [hashicorp/terraform release v1.13.0](https://github.com/hashicorp/terraform/releases/tag/v1.13.0)
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

This page is generated from [`registry/terraform.json`](https://github.com/arminazimi/evergreen/blob/main/registry/terraform.json), rule `terraform.cli.end-of-support-1.11`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/terraform.cli.end-of-support-1.11.html",
  "url": "https://arminazimi.github.io/evergreen/rules/terraform.cli.end-of-support-1.11.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/terraform.cli.end-of-support-1.11.html",
  "headline": "Terraform CLI 1.11 is no longer a supported release line — dates, impact, migration",
  "description": "HashiCorp supports the two most recent Terraform release lines. Terraform 1.11 (first released 2025-02-27) stopped being one of them when Terraform 1.13 was released on 2025-08-20.",
  "inLanguage": "en",
  "dateModified": "2026-10-21",
  "keywords": [
    "end-of-support",
    "terraform",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "Terraform CLI 1.11 is no longer a supported release line",
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
      "name": "hashicorp/terraform release v1.13.0",
      "url": "https://github.com/hashicorp/terraform/releases/tag/v1.13.0"
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
}
</script>
