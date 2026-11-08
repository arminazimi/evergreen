---
title: "AKS 1.28 and earlier clusters are no longer supported — dates, impact, migration"
description: "AKS supports a generally available Kubernetes version for 12 months, with opt-in long-term support beyond that."
layout: doc
permalink: "/rules/kubernetes.azure-aks.1-28-and-older.html"
canonical_url: "https://arminazimi.github.io/evergreen/rules/kubernetes.azure-aks.1-28-and-older.html"
image: "/assets/og/kubernetes.azure-aks.1-28-and-older.svg"
review_date: "2026-11-03"
last_modified_at: "2026-11-03"
json_twin: "/rules/kubernetes.azure-aks.1-28-and-older.json"
---

# AKS 1.28 and earlier clusters are no longer supported

**End of life.** The source gives no day. Replacement: Azure Kubernetes Service 1.35 or later. Source: [Supported Kubernetes versions in Azure Kubernetes Service (AKS)](https://learn.microsoft.com/en-us/azure/aks/supported-kubernetes-versions).

Check a version:

```bash
evergreen check pkg:generic/azure-aks
```

AKS supports a generally available Kubernetes version for 12 months, with opt-in long-term support beyond that. Versions before 1.29 are no longer listed on the AKS supported-versions page and are past both windows.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `kubernetes` |
| Component | `pkg:generic/azure-aks` |
| Affected versions | `vers:semver/<1.29.0` |
| Date from the source | The source gives no day |
| Replacement | Azure Kubernetes Service 1.35 or later |
| Evidence last seen | 2026-11-03 |
| Reviewed | 2026-11-03 by arminazimi |
| Review due | 2027-11-03 (365 days after the last review) |
| Rule ID | `kubernetes.azure-aks.1-28-and-older` |

## Sources

- [Supported Kubernetes versions in Azure Kubernetes Service (AKS)](https://learn.microsoft.com/en-us/azure/aks/supported-kubernetes-versions) (accessed 2026-11-03)

## Migration

**Constraints**

- AKS upgrades one minor version at a time and upgrades the control plane before the agent pools.
- Long-term support is opt-in per cluster; without it, a version stops receiving patches at the end of its 12-month support window.
- An agent pool cannot run a newer version than its control plane, so raise the control plane and the pools together.

**Steps**

1. **Raise the cluster version.** Run az aks upgrade with the version in the replacement to move the control plane, after checking the upgrade notes for every minor version crossed.
2. **Raise the agent pools.** Run az aks nodepool upgrade for each agent pool so every pool reports the new orchestrator version.
3. **Align the cluster declaration.** Set kubernetes_version and each node pool orchestrator_version in the Terraform, Bicep, or Azure Resource Manager definition of the cluster to the same replacement version.
4. **Remove APIs the new version deleted.** Read the Kubernetes deprecation guide for every minor version crossed and replace removed API versions in manifests and Helm charts before applying.

**Verification**

- `kubectl version`: Confirm the API server and kubectl agree on the new version.
- `kubectl get nodes -o wide`: Confirm every node runs a compatible version.

## Detected by

The [`kubernetes`](../detectors/kubernetes.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Other versions of this product

- [AKS 1.29 cluster is past long-term support](kubernetes.azure-aks.1-29.html)
- [AKS 1.30 cluster is past long-term support](kubernetes.azure-aks.1-30.html)
- [AKS 1.31 cluster is past its 12-month support window](kubernetes.azure-aks.1-31.html)
- [AKS 1.32 cluster is past its 12-month support window](kubernetes.azure-aks.1-32.html)
- [AKS 1.33 cluster is past its 12-month support window](kubernetes.azure-aks.1-33.html)
- [AKS 1.34 cluster is scheduled to leave its 12-month support window](kubernetes.azure-aks.1-34.html)

### Same ecosystem

- [MutatingWebhookConfiguration admissionregistration.k8s.io/v1beta1 is no longer served](kubernetes.admissionregistration-k8s-io.mutatingwebhookconfiguration.v1beta1.removed.html)
- [ValidatingWebhookConfiguration admissionregistration.k8s.io/v1beta1 is no longer served](kubernetes.admissionregistration-k8s-io.validatingwebhookconfiguration.v1beta1.removed.html)
- [EKS 1.30 and earlier clusters are past end of extended support](kubernetes.amazon-eks.1-30-and-older.html)
- [EKS 1.31 cluster is past end of standard support](kubernetes.amazon-eks.1-31.html)
- [EKS 1.32 cluster is past end of standard support](kubernetes.amazon-eks.1-32.html)
- [EKS 1.33 cluster is past end of standard support](kubernetes.amazon-eks.1-33.html)
- [EKS 1.34 cluster is scheduled to leave standard support](kubernetes.amazon-eks.1-34.html)
- [EKS 1.35 cluster is scheduled to leave standard support](kubernetes.amazon-eks.1-35.html)


## Data

This page is generated from [`registry/kubernetes.json`](https://github.com/arminazimi/evergreen/blob/main/registry/kubernetes.json), rule `kubernetes.azure-aks.1-28-and-older`, in the `ebb.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/kubernetes.azure-aks.1-28-and-older.html",
      "url": "https://arminazimi.github.io/evergreen/rules/kubernetes.azure-aks.1-28-and-older.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/kubernetes.azure-aks.1-28-and-older.html",
      "headline": "AKS 1.28 and earlier clusters are no longer supported — dates, impact, migration",
      "description": "AKS supports a generally available Kubernetes version for 12 months, with opt-in long-term support beyond that.",
      "inLanguage": "en",
      "dateModified": "2026-11-03",
      "keywords": [
        "end-of-life",
        "kubernetes",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "AKS 1.28 and earlier clusters are no longer supported",
        "identifier": "pkg:generic/azure-aks"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Supported Kubernetes versions in Azure Kubernetes Service (AKS)",
          "url": "https://learn.microsoft.com/en-us/azure/aks/supported-kubernetes-versions"
        }
      ],
      "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/kubernetes.json",
      "publisher": {
        "@type": "Organization",
        "name": "Evergreen",
        "url": "https://arminazimi.github.io/evergreen"
      }
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/kubernetes.azure-aks.1-28-and-older.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/kubernetes.azure-aks.1-28-and-older.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/azure-aks?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life. The source gives no day. Affected versions: vers:semver/\u003c1.29.0. Source: Supported Kubernetes versions in Azure Kubernetes Service (AKS) (https://learn.microsoft.com/en-us/azure/aks/supported-kubernetes-versions)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/azure-aks?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Azure Kubernetes Service 1.35 or later"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/azure-aks?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/azure-aks."
          }
        }
      ]
    }
  ]
}
</script>
