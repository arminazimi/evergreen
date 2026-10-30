---
title: "GKE 1.33 is past end of standard support — dates, impact, migration"
description: "GKE 1.33 reached the end of standard support on 2026-08-12 and is in extended support until 2027-06-12."
canonical_url: "https://arminazimi.github.io/evergreen/rules/terraform.gke.end-of-support-1.33.html"
json_twin: "/rules/terraform.gke.end-of-support-1.33.json"
---

# GKE 1.33 is past end of standard support

**End of support** as of 2026-08-12. Replacement: GKE 1.35 or later. Source: [GKE versioning and support](https://cloud.google.com/kubernetes-engine/versioning).

Check a version:

```bash
evergreen check pkg:generic/google-kubernetes-engine
```

GKE 1.33 reached the end of standard support on 2026-08-12 and is in extended support until 2027-06-12. GKE provides up to 24 months of support per minor version: about 14 months of standard support and the rest as extended support in the Extended channel.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of support |
| Severity | medium |
| Ecosystem | `terraform` |
| Component | `pkg:generic/google-kubernetes-engine` |
| Affected versions | `vers:semver/>=1.33.0\|<1.34.0` |
| Date from the source | 2026-08-12 |
| Replacement | GKE 1.35 or later |
| Evidence last seen | 2026-10-26 |
| Reviewed | 2026-10-26 by arminazimi |
| Review due | 2027-01-24 (90 days after the last review) |
| Rule ID | `terraform.gke.end-of-support-1.33` |

## Sources

- [GKE versioning and support](https://cloud.google.com/kubernetes-engine/versioning)
- [GKE release schedule](https://cloud.google.com/kubernetes-engine/docs/release-schedule)

## Migration

**Constraints**

- GKE upgrades one minor version at a time and may auto-upgrade a cluster whose version reaches end of support.
- Only a cluster in the Extended channel keeps receiving security patches past the end of standard support.
- Node pools and the control plane must be on compatible versions, so raise both in the same change.

**Steps**

1. **Raise the control-plane version.** Set min_master_version to the release in the replacement, or remove it so the cluster follows its release channel.
2. **Raise the node pools.** Raise google_container_node_pool version, or let the release channel manage it, so nodes match the control plane.
3. **Remove APIs the new version deleted.** Read the Kubernetes deprecation guide for every minor version crossed and replace removed API versions in manifests and Helm charts before applying.

**Verification**

- `terraform init -backend=false && terraform validate`: Initialize without touching remote state and check that the configuration is valid.
- `terraform plan`: Review the plan and confirm the control-plane and node-pool changes are the intended ones.
- `gcloud container clusters describe <cluster> --zone <zone> --format='value(currentMasterVersion)'`: Confirm the control plane reports the new version.
- `kubectl version`: Confirm kubectl and the API server agree on the version.

## Detected by

The `terraform` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Other versions of this product

- [GKE 1.29 and earlier are no longer supported](terraform.gke.end-of-life-1.29-and-older.html)
- [GKE 1.30 is past end of extended support](terraform.gke.end-of-life-1.30.html)
- [GKE 1.31 is past end of extended support](terraform.gke.end-of-life-1.31.html)
- [GKE 1.32 is past end of standard support](terraform.gke.end-of-support-1.32.html)

### Same ecosystem

- [AKS 1.28 and earlier are no longer supported](terraform.aks.end-of-life-1.28-and-older.html)
- [AKS 1.29 is past long-term support](terraform.aks.end-of-life-1.29.html)
- [AKS 1.30 is past long-term support](terraform.aks.end-of-life-1.30.html)
- [AKS 1.31 is past its 12-month support window](terraform.aks.end-of-support-1.31.html)
- [AKS 1.32 is past its 12-month support window](terraform.aks.end-of-support-1.32.html)
- [AKS 1.33 is past its 12-month support window](terraform.aks.end-of-support-1.33.html)
- [Terraform CLI 1.10 is no longer a supported release line](terraform.cli.end-of-support-1.10.html)
- [Terraform CLI 1.11 is no longer a supported release line](terraform.cli.end-of-support-1.11.html)


## Data

This page is generated from [`registry/terraform.json`](https://github.com/arminazimi/evergreen/blob/main/registry/terraform.json), rule `terraform.gke.end-of-support-1.33`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/terraform.gke.end-of-support-1.33.html",
      "url": "https://arminazimi.github.io/evergreen/rules/terraform.gke.end-of-support-1.33.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/terraform.gke.end-of-support-1.33.html",
      "headline": "GKE 1.33 is past end of standard support — dates, impact, migration",
      "description": "GKE 1.33 reached the end of standard support on 2026-08-12 and is in extended support until 2027-06-12.",
      "inLanguage": "en",
      "dateModified": "2026-10-26",
      "keywords": [
        "end-of-support",
        "terraform",
        "medium"
      ],
      "about": {
        "@type": "Thing",
        "name": "GKE 1.33 is past end of standard support",
        "identifier": "pkg:generic/google-kubernetes-engine"
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
      "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/terraform.json",
      "publisher": {
        "@type": "Organization",
        "name": "Evergreen",
        "url": "https://arminazimi.github.io/evergreen"
      }
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/terraform.gke.end-of-support-1.33.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/terraform.gke.end-of-support-1.33.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/google-kubernetes-engine?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of support as of 2026-08-12. Affected versions: vers:semver/>=1.33.0|\u003c1.34.0. Source: GKE versioning and support (https://cloud.google.com/kubernetes-engine/versioning)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/google-kubernetes-engine?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "GKE 1.35 or later"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/google-kubernetes-engine?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/google-kubernetes-engine."
          }
        }
      ]
    }
  ]
}
</script>
