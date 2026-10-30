---
title: "AKS 1.29 is past long-term support — dates, impact, migration"
description: "AKS 1.29 reached the end of its 12-month support window on 2025-03-31 and the end of long-term support on 2026-04-30. AKS no longer provides patches for this version."
canonical_url: "https://arminazimi.github.io/evergreen/rules/terraform.aks.end-of-life-1.29.html"
---

# AKS 1.29 is past long-term support

**End of life** as of 2026-04-30. Replacement: Azure Kubernetes Service 1.35 or later. Source: [Supported Kubernetes versions in Azure Kubernetes Service (AKS)](https://learn.microsoft.com/en-us/azure/aks/supported-kubernetes-versions).

Check a version:

```bash
evergreen check pkg:generic/azure-kubernetes-service
```

AKS 1.29 reached the end of its 12-month support window on 2025-03-31 and the end of long-term support on 2026-04-30. AKS no longer provides patches for this version.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `terraform` |
| Component | `pkg:generic/azure-kubernetes-service` |
| Affected versions | `vers:semver/>=1.29.0\|<1.30.0` |
| Date from the source | 2026-04-30 |
| Replacement | Azure Kubernetes Service 1.35 or later |
| Evidence last seen | 2026-10-26 |
| Reviewed | 2026-10-26 by arminazimi |
| Review due | 2027-01-24 (90 days after the last review) |
| Rule ID | `terraform.aks.end-of-life-1.29` |

## Sources

- [Supported Kubernetes versions in Azure Kubernetes Service (AKS)](https://learn.microsoft.com/en-us/azure/aks/supported-kubernetes-versions)

## Migration

**Constraints**

- AKS upgrades one minor version at a time and upgrades the control plane before the agent pools.
- Long-term support is opt-in per cluster; without it, a version stops receiving patches at the end of its 12-month support window.
- An agent pool cannot run a newer version than its control plane, so raise the control plane and the pools together.

**Steps**

1. **Raise the cluster version.** Set kubernetes_version to the release in the replacement, then run terraform plan and apply the control-plane upgrade.
2. **Raise the agent pools.** Raise each azurerm_kubernetes_cluster_node_pool orchestrator_version so the agent pools match the new control plane.
3. **Remove APIs the new version deleted.** Read the Kubernetes deprecation guide for every minor version crossed and replace removed API versions in manifests and Helm charts before applying.

**Verification**

- `terraform init -backend=false && terraform validate`: Initialize without touching remote state and check that the configuration is valid.
- `terraform plan`: Review the plan and confirm the control-plane and agent-pool changes are the intended ones.
- `az aks show --resource-group <group> --name <cluster> --query kubernetesVersion`: Confirm the control plane reports the new version.
- `kubectl version`: Confirm kubectl and the API server agree on the version.

## Detected by

The `terraform` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/terraform.json`](https://github.com/arminazimi/evergreen/blob/main/registry/terraform.json), rule `terraform.aks.end-of-life-1.29`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/terraform.aks.end-of-life-1.29.html",
  "url": "https://arminazimi.github.io/evergreen/rules/terraform.aks.end-of-life-1.29.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/terraform.aks.end-of-life-1.29.html",
  "headline": "AKS 1.29 is past long-term support — dates, impact, migration",
  "description": "AKS 1.29 reached the end of its 12-month support window on 2025-03-31 and the end of long-term support on 2026-04-30. AKS no longer provides patches for this version.",
  "inLanguage": "en",
  "dateModified": "2026-10-26",
  "keywords": [
    "end-of-life",
    "terraform",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "AKS 1.29 is past long-term support",
    "identifier": "pkg:generic/azure-kubernetes-service"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Supported Kubernetes versions in Azure Kubernetes Service (AKS)",
      "url": "https://learn.microsoft.com/en-us/azure/aks/supported-kubernetes-versions"
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
