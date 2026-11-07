---
title: "Kubernetes 1.28 and older are end-of-life — dates, impact, migration"
description: "Every Kubernetes minor before 1.29 has passed its published end-of-life date; the release history page archives these lines, and the kubernetes-2 importer drafts only the five newest ended ones, so…"
layout: doc
permalink: "/rules/kubernetes.release.1.28-and-older.html"
canonical_url: "https://arminazimi.github.io/evergreen/rules/kubernetes.release.1.28-and-older.html"
image: "/assets/og/kubernetes.release.1.28-and-older.svg"
review_date: "2026-11-01"
last_modified_at: "2026-11-01"
json_twin: "/rules/kubernetes.release.1.28-and-older.json"
---

# Kubernetes 1.28 and older are end-of-life

**End of life.** The source gives no day. Replacement: Kubernetes 1.34 or later. Source: [Kubernetes release history](https://kubernetes.io/releases/).

Check a version:

```bash
evergreen check pkg:generic/kubernetes
```

Every Kubernetes minor before 1.29 has passed its published end-of-life date; the release history page archives these lines, and the kubernetes-2 importer drafts only the five newest ended ones, so this reviewed rule covers the rest. Managed providers retire minors on their own calendars; the EKS, GKE, and AKS rules cover those schedules.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `kubernetes` |
| Component | `pkg:generic/kubernetes` |
| Affected versions | `vers:semver/<1.29.0` |
| Date from the source | The source gives no day |
| Replacement | Kubernetes 1.34 or later |
| Evidence last seen | 2026-11-01 |
| Reviewed | 2026-11-01 by arminazimi |
| Review due | 2027-11-01 (365 days after the last review) |
| Rule ID | `kubernetes.release.1.28-and-older` |

## Sources

- [Kubernetes release history](https://kubernetes.io/releases/) (accessed 2026-11-01)

## Migration

**Constraints**

- Upstream Kubernetes maintains the three most recent minor releases, about twelve months of patch support each; managed providers (EKS, GKE, AKS) retire minors on their own calendars, often sooner.
- Kubernetes upgrades one minor version at a time, and the control plane must be raised before the kubelets that talk to it.
- Each minor crossed can remove served API versions; read the Kubernetes Deprecated API Migration Guide before upgrading.

**Steps**

1. **Raise the control plane.** Raise the control plane to a supported minor, one version at a time, or let the provider's release channel do it.
2. **Raise the nodes.** Raise every node's kubelet to a version compatible with the new control plane.
3. **Remove APIs the new versions deleted.** Read the Kubernetes deprecation guide for every minor version crossed and replace removed API versions before applying.

**Verification**

- `kubectl version`: Confirm the API server and kubectl agree on the new version.
- `kubectl get nodes -o wide`: Confirm every node runs a compatible version.

## Detected by

The [`kubernetes`](../detectors/kubernetes.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Other versions of this product

- [Kubernetes 1.29 is end-of-life](kubernetes.release.end-of-life-1.29.html)
- [Kubernetes 1.30 is end-of-life](kubernetes.release.end-of-life-1.30.html)
- [Kubernetes 1.31 is end-of-life](kubernetes.release.end-of-life-1.31.html)
- [Kubernetes 1.32 is end-of-life](kubernetes.release.end-of-life-1.32.html)
- [Kubernetes 1.33 is end-of-life](kubernetes.release.end-of-life-1.33.html)
- [Kubernetes 1.34 is end-of-life](kubernetes.release.end-of-life-1.34.html)
- [Kubernetes 1.35 reaches end-of-life on 2027-02-28](kubernetes.release.end-of-life-1.35.html)
- [Kubernetes 1.36 reaches end-of-life on 2027-06-28](kubernetes.release.end-of-life-1.36.html)

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

This page is generated from [`registry/kubernetes.json`](https://github.com/arminazimi/evergreen/blob/main/registry/kubernetes.json), rule `kubernetes.release.1.28-and-older`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/kubernetes.release.1.28-and-older.html",
      "url": "https://arminazimi.github.io/evergreen/rules/kubernetes.release.1.28-and-older.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/kubernetes.release.1.28-and-older.html",
      "headline": "Kubernetes 1.28 and older are end-of-life — dates, impact, migration",
      "description": "Every Kubernetes minor before 1.29 has passed its published end-of-life date; the release history page archives these lines, and the kubernetes-2 importer drafts only the five newest ended ones, so…",
      "inLanguage": "en",
      "dateModified": "2026-11-01",
      "keywords": [
        "end-of-life",
        "kubernetes",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "Kubernetes 1.28 and older are end-of-life",
        "identifier": "pkg:generic/kubernetes"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Kubernetes release history",
          "url": "https://kubernetes.io/releases/"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/kubernetes.release.1.28-and-older.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/kubernetes.release.1.28-and-older.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/kubernetes?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life. The source gives no day. Affected versions: vers:semver/\u003c1.29.0. Source: Kubernetes release history (https://kubernetes.io/releases/)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/kubernetes?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Kubernetes 1.34 or later"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/kubernetes?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/kubernetes."
          }
        }
      ]
    }
  ]
}
</script>
