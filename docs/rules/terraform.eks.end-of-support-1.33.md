---
title: "Amazon EKS 1.33 is past end of standard support — dates, impact, migration"
description: "Amazon EKS 1.33 reached the end of standard support on 2026-07-29 and is in extended support until 2027-07-29."
canonical_url: "https://arminazimi.github.io/evergreen/rules/terraform.eks.end-of-support-1.33.html"
---

# Amazon EKS 1.33 is past end of standard support

Amazon EKS 1.33 reached the end of standard support on 2026-07-29 and is in extended support until 2027-07-29. Amazon EKS gives a minor version 14 months of standard support and then up to 12 months of extended support at an additional cost per cluster hour.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of support |
| Severity | medium |
| Ecosystem | `terraform` |
| Component | `pkg:generic/amazon-eks` |
| Affected versions | `vers:semver/>=1.33.0\|<1.34.0` |
| Date from the source | 2026-07-29 |
| Replacement | Amazon EKS 1.35 or later |
| Evidence last seen | 2026-10-26 |
| Reviewed | 2026-10-26 by arminazimi |
| Review due | 2027-01-24 (90 days after the last review) |
| Rule ID | `terraform.eks.end-of-support-1.33` |

## Sources

- [Amazon EKS: Understand the Kubernetes version lifecycle](https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html)

## Migration

**Constraints**

- A control plane and its node groups are upgraded separately: raise the control plane before the node groups and the add-ons that pin a Kubernetes version.
- Amazon EKS upgrades one minor version at a time, so cross each intervening minor version and read its upgrade notes.
- A version past end of extended support is auto-upgraded, and a version in extended support is billed at the extended-support rate.

**Steps**

1. **Raise the cluster version.** Set cluster_version to the release in the replacement, then run terraform plan and apply the control-plane upgrade.
2. **Raise the node groups and add-ons.** Raise each aws_eks_node_group version and each managed add-on that pins a Kubernetes version so they match the new control plane.
3. **Remove APIs the new version deleted.** Read the Kubernetes deprecation guide for every minor version crossed and replace removed API versions in manifests and Helm charts before applying.

**Verification**

- `terraform init -backend=false && terraform validate`: Initialize without touching remote state and check that the configuration is valid.
- `terraform plan`: Review the plan and confirm the control-plane and node-group changes are the intended ones.
- `aws eks describe-cluster --name <cluster> --query 'cluster.version'`: Confirm the control plane reports the new version.
- `kubectl version`: Confirm kubectl and the API server agree on the version.

## Detected by

The `terraform` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/terraform.json`](https://github.com/arminazimi/evergreen/blob/main/registry/terraform.json), rule `terraform.eks.end-of-support-1.33`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/terraform.eks.end-of-support-1.33.html",
  "url": "https://arminazimi.github.io/evergreen/rules/terraform.eks.end-of-support-1.33.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/terraform.eks.end-of-support-1.33.html",
  "headline": "Amazon EKS 1.33 is past end of standard support — dates, impact, migration",
  "description": "Amazon EKS 1.33 reached the end of standard support on 2026-07-29 and is in extended support until 2027-07-29.",
  "inLanguage": "en",
  "dateModified": "2026-10-26",
  "keywords": [
    "end-of-support",
    "terraform",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "Amazon EKS 1.33 is past end of standard support",
    "identifier": "pkg:generic/amazon-eks"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Amazon EKS: Understand the Kubernetes version lifecycle",
      "url": "https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html"
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
