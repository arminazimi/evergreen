---
title: "GKE 1.30 cluster is past end of extended support — dates, impact, migration"
description: "The GKE release schedule lists GKE 1.30 with end of standard support on 2025-09-30 and end of extended support on 2026-07-30. GKE no longer provides patches for this minor version."
layout: doc
permalink: "/rules/kubernetes.google-gke.1.30.html"
canonical_url: "https://arminazimi.github.io/evergreen/rules/kubernetes.google-gke.1.30.html"
image: "/assets/og/kubernetes.google-gke.1.30.svg"
review_date: "2026-10-30"
last_modified_at: "2026-10-30"
json_twin: "/rules/kubernetes.google-gke.1.30.json"
---

# GKE 1.30 cluster is past end of extended support

**End of life** as of 2026-07-30. Replacement: GKE 1.35 or later. Source: [GKE versioning and support](https://cloud.google.com/kubernetes-engine/versioning).

Check a version:

```bash
evergreen check pkg:generic/google-gke
```

The GKE release schedule lists GKE 1.30 with end of standard support on 2025-09-30 and end of extended support on 2026-07-30. GKE no longer provides patches for this minor version.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `kubernetes` |
| Component | `pkg:generic/google-gke` |
| Affected versions | `vers:semver/>=1.30.0\|<1.31.0` |
| Date from the source | 2026-07-30 |
| Replacement | GKE 1.35 or later |
| Evidence last seen | 2026-10-30 |
| Reviewed | 2026-10-30 by arminazimi |
| Review due | 2027-10-30 (365 days after the last review) |
| Rule ID | `kubernetes.google-gke.1.30` |

## Sources

- [GKE versioning and support](https://cloud.google.com/kubernetes-engine/versioning) (accessed 2026-10-30)
- [GKE release schedule](https://cloud.google.com/kubernetes-engine/docs/release-schedule) (accessed 2026-10-30)

## Migration

**Constraints**

- GKE upgrades one minor version at a time and may auto-upgrade a cluster whose version reaches end of support.
- Only a cluster in the Extended channel keeps receiving security patches past the end of standard support.
- Node pools and the control plane must be on compatible versions, so raise both in the same change.

**Steps**

1. **Raise the control-plane version.** Raise the cluster's Kubernetes version to a supported release, or let its release channel do it.
2. **Raise the node pools.** Raise every node pool to a compatible version, or let the release channel manage it.
3. **Remove APIs the new version deleted.** Read the Kubernetes deprecation guide for every minor version crossed and replace removed API versions before applying.

**Verification**

- `kubectl version`: Confirm the API server and kubectl agree on the new version.
- `kubectl get nodes -o wide`: Confirm every node runs a compatible version.

## Detected by

The [`kubernetes`](../detectors/kubernetes.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Other versions of this product

- [GKE 1.29 and earlier clusters are no longer supported](kubernetes.google-gke.1.29-and-older.html)
- [GKE 1.31 cluster is past end of extended support](kubernetes.google-gke.1.31.html)
- [GKE 1.32 cluster is past end of standard support](kubernetes.google-gke.1.32.html)
- [GKE 1.33 cluster is past end of standard support](kubernetes.google-gke.1.33.html)

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

This page is generated from [`registry/kubernetes.json`](https://github.com/arminazimi/evergreen/blob/main/registry/kubernetes.json), rule `kubernetes.google-gke.1.30`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/kubernetes.google-gke.1.30.html",
      "url": "https://arminazimi.github.io/evergreen/rules/kubernetes.google-gke.1.30.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/kubernetes.google-gke.1.30.html",
      "headline": "GKE 1.30 cluster is past end of extended support — dates, impact, migration",
      "description": "The GKE release schedule lists GKE 1.30 with end of standard support on 2025-09-30 and end of extended support on 2026-07-30. GKE no longer provides patches for this minor version.",
      "inLanguage": "en",
      "dateModified": "2026-10-30",
      "keywords": [
        "end-of-life",
        "kubernetes",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "GKE 1.30 cluster is past end of extended support",
        "identifier": "pkg:generic/google-gke"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "GKE versioning and support",
          "url": "https://cloud.google.com/kubernetes-engine/versioning"
        },
        {
          "@type": "CreativeWork",
          "name": "GKE release schedule",
          "url": "https://cloud.google.com/kubernetes-engine/docs/release-schedule"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/kubernetes.google-gke.1.30.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/kubernetes.google-gke.1.30.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/google-gke?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life as of 2026-07-30. Affected versions: vers:semver/>=1.30.0|\u003c1.31.0. Source: GKE versioning and support (https://cloud.google.com/kubernetes-engine/versioning)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/google-gke?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "GKE 1.35 or later"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/google-gke?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/google-gke."
          }
        }
      ]
    }
  ]
}
</script>
