---
title: "GKE 1.29 and earlier are no longer supported — dates, impact, migration"
description: "The GKE release schedule states that GKE 1.29 and earlier have reached end of support and are no longer supported."
canonical_url: "https://arminazimi.github.io/evergreen/rules/terraform.gke.end-of-life-1.29-and-older.html"
json_twin: "/rules/terraform.gke.end-of-life-1.29-and-older.json"
---

# GKE 1.29 and earlier are no longer supported

The GKE release schedule states that GKE 1.29 and earlier have reached end of support and are no longer supported.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `terraform` |
| Component | `pkg:generic/google-kubernetes-engine` |
| Affected versions | `vers:semver/<1.30.0` |
| Date from the source | The source gives no day |
| Replacement | GKE 1.35 or later |
| Evidence last seen | 2026-10-26 |
| Reviewed | 2026-10-26 by arminazimi |
| Review due | 2027-01-24 (90 days after the last review) |
| Rule ID | `terraform.gke.end-of-life-1.29-and-older` |

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

## Data

This page is generated from [`registry/terraform.json`](https://github.com/arminazimi/evergreen/blob/main/registry/terraform.json), rule `terraform.gke.end-of-life-1.29-and-older`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/terraform.gke.end-of-life-1.29-and-older.html",
  "url": "https://arminazimi.github.io/evergreen/rules/terraform.gke.end-of-life-1.29-and-older.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/terraform.gke.end-of-life-1.29-and-older.html",
  "headline": "GKE 1.29 and earlier are no longer supported — dates, impact, migration",
  "description": "The GKE release schedule states that GKE 1.29 and earlier have reached end of support and are no longer supported.",
  "inLanguage": "en",
  "dateModified": "2026-10-26",
  "keywords": [
    "end-of-life",
    "terraform",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "GKE 1.29 and earlier are no longer supported",
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
}
</script>
