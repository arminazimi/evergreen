---
title: "EKS 1.31 cluster is past end of standard support — dates, impact, migration"
description: "The Amazon EKS release calendar gives 1.31 end of standard support on 2025-11-26 and end of extended support on 2026-11-26."
layout: doc
permalink: "/rules/kubernetes.amazon-eks.1-31.html"
canonical_url: "https://arminazimi.github.io/evergreen/rules/kubernetes.amazon-eks.1-31.html"
image: "/assets/og/kubernetes.amazon-eks.1-31.svg"
review_date: "2026-11-03"
last_modified_at: "2026-11-03"
json_twin: "/rules/kubernetes.amazon-eks.1-31.json"
---

# EKS 1.31 cluster is past end of standard support

**End of support** as of 2025-11-26. Replacement: Amazon EKS 1.35 or later. Source: [Amazon EKS: Understand the Kubernetes version lifecycle](https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html).

Check a version:

```bash
evergreen check pkg:generic/amazon-eks
```

The Amazon EKS release calendar gives 1.31 end of standard support on 2025-11-26 and end of extended support on 2026-11-26. The cluster now receives patches only while extended support is enabled, and pays the extended-support rate per cluster hour.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of support |
| Severity | medium |
| Ecosystem | `kubernetes` |
| Component | `pkg:generic/amazon-eks` |
| Affected versions | `vers:semver/>=1.31.0\|<1.32.0` |
| Date from the source | 2025-11-26 |
| Replacement | Amazon EKS 1.35 or later |
| Evidence last seen | 2026-11-03 |
| Reviewed | 2026-11-03 by arminazimi |
| Review due | 2027-11-03 (365 days after the last review) |
| Rule ID | `kubernetes.amazon-eks.1-31` |

## Sources

- [Amazon EKS: Understand the Kubernetes version lifecycle](https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html) (accessed 2026-11-03)

## Migration

**Constraints**

- Amazon EKS upgrades one minor version at a time, so cross each intervening minor version and read its upgrade notes before applying the next one.
- A control plane and its node groups upgrade separately: raise the control plane first, then every node group and every add-on that pins a Kubernetes version.
- Managed node groups and self-managed nodes do not follow a control-plane upgrade, so a node group left behind keeps running the older release line.

**Steps**

1. **Raise the control-plane version.** Run aws eks update-cluster-version with the version in the replacement, or set version and spec.version in the CloudFormation, Terraform, or eksctl declaration of the cluster, and confirm the result with aws eks describe-cluster.
2. **Raise the node groups.** Run aws eks update-nodegroup-version for each managed node group, and replace the Amazon EKS optimized AMI in the launch template of each self-managed group so its nodes roll onto the new version.
3. **Update the add-ons that pin a version.** Set kube-proxy, Amazon VPC CNI, and CoreDNS to the version Amazon EKS recommends for the new cluster version, and check any other add-on that declares a Kubernetes version.
4. **Remove APIs the new version deleted.** Read the Kubernetes deprecation guide for every minor version crossed and replace removed API versions in manifests and Helm charts before applying.

**Verification**

- `kubectl version`: Confirm the API server reports the new version.
- `kubectl get nodes -o wide`: Confirm every node runs a kubelet of the new version.
- `kubeconform -strict -summary .`: Confirm the manifests still validate against the new API versions.

## Detected by

The [`kubernetes`](../detectors/kubernetes.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Other versions of this product

- [EKS 1.30 and earlier clusters are past end of extended support](kubernetes.amazon-eks.1-30-and-older.html)
- [EKS 1.32 cluster is past end of standard support](kubernetes.amazon-eks.1-32.html)
- [EKS 1.33 cluster is past end of standard support](kubernetes.amazon-eks.1-33.html)
- [EKS 1.34 cluster is scheduled to leave standard support](kubernetes.amazon-eks.1-34.html)
- [EKS 1.35 cluster is scheduled to leave standard support](kubernetes.amazon-eks.1-35.html)
- [EKS 1.36 cluster is scheduled to leave standard support](kubernetes.amazon-eks.1-36.html)

### Same ecosystem

- [MutatingWebhookConfiguration admissionregistration.k8s.io/v1beta1 is no longer served](kubernetes.admissionregistration-k8s-io.mutatingwebhookconfiguration.v1beta1.removed.html)
- [ValidatingWebhookConfiguration admissionregistration.k8s.io/v1beta1 is no longer served](kubernetes.admissionregistration-k8s-io.validatingwebhookconfiguration.v1beta1.removed.html)
- [CustomResourceDefinition apiextensions.k8s.io/v1beta1 is no longer served](kubernetes.apiextensions-k8s-io.customresourcedefinition.v1beta1.removed.html)
- [APIService apiregistration.k8s.io/v1beta1 is no longer served](kubernetes.apiregistration-k8s-io.apiservice.v1beta1.removed.html)
- [DaemonSet apps/v1beta2 is no longer served](kubernetes.apps.daemonset.v1beta2.removed.html)
- [Deployment apps/v1beta1 is no longer served](kubernetes.apps.deployment.v1beta1.removed.html)
- [Deployment apps/v1beta2 is no longer served](kubernetes.apps.deployment.v1beta2.removed.html)
- [ReplicaSet apps/v1beta1 is no longer served](kubernetes.apps.replicaset.v1beta1.removed.html)


## Data

This page is generated from [`registry/kubernetes.json`](https://github.com/arminazimi/evergreen/blob/main/registry/kubernetes.json), rule `kubernetes.amazon-eks.1-31`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/kubernetes.amazon-eks.1-31.html",
      "url": "https://arminazimi.github.io/evergreen/rules/kubernetes.amazon-eks.1-31.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/kubernetes.amazon-eks.1-31.html",
      "headline": "EKS 1.31 cluster is past end of standard support — dates, impact, migration",
      "description": "The Amazon EKS release calendar gives 1.31 end of standard support on 2025-11-26 and end of extended support on 2026-11-26.",
      "inLanguage": "en",
      "dateModified": "2026-11-03",
      "keywords": [
        "end-of-support",
        "kubernetes",
        "medium"
      ],
      "about": {
        "@type": "Thing",
        "name": "EKS 1.31 cluster is past end of standard support",
        "identifier": "pkg:generic/amazon-eks"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Amazon EKS: Understand the Kubernetes version lifecycle",
          "url": "https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/kubernetes.amazon-eks.1-31.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/kubernetes.amazon-eks.1-31.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/amazon-eks?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of support as of 2025-11-26. Affected versions: vers:semver/>=1.31.0|\u003c1.32.0. Source: Amazon EKS: Understand the Kubernetes version lifecycle (https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/amazon-eks?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Amazon EKS 1.35 or later"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/amazon-eks?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/amazon-eks."
          }
        }
      ]
    }
  ]
}
</script>
