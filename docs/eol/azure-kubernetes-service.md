---
title: "Is Azure Kubernetes Service end of life? — versions, dates, sources"
description: "Some Azure Kubernetes Service releases are end of life. AKS 1.30 is past long-term support as of 2026-07-31."
canonical_url: "https://arminazimi.github.io/evergreen/eol/azure-kubernetes-service.html"
---

# Is Azure Kubernetes Service end of life?

**Some Azure Kubernetes Service releases are end of life.** AKS 1.30 is past long-term support as of 2026-07-31. This page lists 6 reviewed lifecycle rules for `pkg:generic/azure-kubernetes-service`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:generic/azure-kubernetes-service
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [AKS 1.30 is past long-term support](../rules/terraform.aks.end-of-life-1.30.html) | End of life | 2026-07-31 | `vers:semver/>=1.30.0\|<1.31.0` | [Supported Kubernetes versions in Azure Kubernetes Service (AKS)](https://learn.microsoft.com/en-us/azure/aks/supported-kubernetes-versions) |
| [AKS 1.29 is past long-term support](../rules/terraform.aks.end-of-life-1.29.html) | End of life | 2026-04-30 | `vers:semver/>=1.29.0\|<1.30.0` | [Supported Kubernetes versions in Azure Kubernetes Service (AKS)](https://learn.microsoft.com/en-us/azure/aks/supported-kubernetes-versions) |
| [AKS 1.28 and earlier are no longer supported](../rules/terraform.aks.end-of-life-1.28-and-older.html) | End of life | The source gives no day | `vers:semver/<1.29.0` | [Supported Kubernetes versions in Azure Kubernetes Service (AKS)](https://learn.microsoft.com/en-us/azure/aks/supported-kubernetes-versions) |
| [AKS 1.33 is past its 12-month support window](../rules/terraform.aks.end-of-support-1.33.html) | End of support | 2026-07-31 | `vers:semver/>=1.33.0\|<1.34.0` | [Supported Kubernetes versions in Azure Kubernetes Service (AKS)](https://learn.microsoft.com/en-us/azure/aks/supported-kubernetes-versions) |
| [AKS 1.32 is past its 12-month support window](../rules/terraform.aks.end-of-support-1.32.html) | End of support | 2026-03-31 | `vers:semver/>=1.32.0\|<1.33.0` | [Supported Kubernetes versions in Azure Kubernetes Service (AKS)](https://learn.microsoft.com/en-us/azure/aks/supported-kubernetes-versions) |
| [AKS 1.31 is past its 12-month support window](../rules/terraform.aks.end-of-support-1.31.html) | End of support | 2025-11-01 | `vers:semver/>=1.31.0\|<1.32.0` | [Supported Kubernetes versions in Azure Kubernetes Service (AKS)](https://learn.microsoft.com/en-us/azure/aks/supported-kubernetes-versions) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/azure-kubernetes-service.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/azure-kubernetes-service.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Azure Kubernetes Service end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Some Azure Kubernetes Service releases are end of life. AKS 1.30 is past long-term support as of 2026-07-31. This page lists 6 reviewed lifecycle rules for pkg:generic/azure-kubernetes-service, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check Azure Kubernetes Service?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:generic/azure-kubernetes-service."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the Azure Kubernetes Service dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
