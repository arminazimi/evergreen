---
title: "HorizontalPodAutoscaler autoscaling/v2beta2 is no longer served"
description: "The Kubernetes Deprecated API Migration Guide states that the autoscaling/v2beta2 API version of HorizontalPodAutoscaler is no longer served as of v1.26, which was released on 2022-12-09."
---

# HorizontalPodAutoscaler autoscaling/v2beta2 is no longer served

The Kubernetes Deprecated API Migration Guide states that the autoscaling/v2beta2 API version of HorizontalPodAutoscaler is no longer served as of v1.26, which was released on 2022-12-09.

| | |
| --- | --- |
| Status | Removed |
| Severity | high |
| Ecosystem | `kubernetes` |
| Component | `pkg:generic/kubernetes/autoscaling/HorizontalPodAutoscaler` |
| Affected versions | `vers:semver/2.0.0-beta.2` |
| Date from the source | 2022-12-09 |
| Replacement | autoscaling/v2 HorizontalPodAutoscaler, available since v1.23 |
| Evidence last seen | 2026-10-17 |
| Reviewed | 2026-10-17 by arminazimi |
| Review due | 2027-10-17 (365 days after the last review) |
| Rule ID | `kubernetes.autoscaling.horizontalpodautoscaler.v2beta2.removed` |

## Sources

- [Kubernetes Deprecated API Migration Guide](https://kubernetes.io/docs/reference/using-api/deprecation-guide/)
- [Kubernetes v1.26: Electrifying (release announcement, 2022-12-09)](https://kubernetes.io/blog/2022/12/09/kubernetes-v1-26-release/)

## Migration

**Constraints**

- Keep the scaling targets and the min and max replica counts unchanged.
- In autoscaling/v2, targetAverageUtilization is replaced by target.averageUtilization together with target.type: Utilization.

**Steps**

1. **Change the HorizontalPodAutoscaler apiVersion.** Change the reported `apiVersion` to `autoscaling/v2` and rewrite any metric target fields that use the old names.
2. **Align other HorizontalPodAutoscaler declarations.** Update every other manifest, Helm template, and kustomize patch or target that names the old API version, so the repository agrees.

**Verification**

- `kubeconform -strict -summary <manifest-paths>`: Validate the migrated manifests against the schemas of the target Kubernetes version.
- `kubectl apply --dry-run=server -f <manifest-path>`: Ask a cluster on the target version to accept the migrated manifest without applying it.
- `helm template <chart-path> | kubeconform -strict -`: For a Helm chart, render it and validate the output.

## Detected by

The [`kubernetes`](../detectors/kubernetes.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/kubernetes.json`](https://github.com/arminazimi/evergreen/blob/main/registry/kubernetes.json), rule `kubernetes.autoscaling.horizontalpodautoscaler.v2beta2.removed`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/kubernetes.autoscaling.horizontalpodautoscaler.v2beta2.removed.html",
  "url": "https://arminazimi.github.io/evergreen/rules/kubernetes.autoscaling.horizontalpodautoscaler.v2beta2.removed.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/kubernetes.autoscaling.horizontalpodautoscaler.v2beta2.removed.html",
  "headline": "HorizontalPodAutoscaler autoscaling/v2beta2 is no longer served",
  "description": "The Kubernetes Deprecated API Migration Guide states that the autoscaling/v2beta2 API version of HorizontalPodAutoscaler is no longer served as of v1.26, which was released on 2022-12-09.",
  "inLanguage": "en",
  "dateModified": "2026-10-17",
  "keywords": [
    "removed",
    "kubernetes",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "HorizontalPodAutoscaler autoscaling/v2beta2 is no longer served",
    "identifier": "pkg:generic/kubernetes/autoscaling/HorizontalPodAutoscaler"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Kubernetes Deprecated API Migration Guide",
      "url": "https://kubernetes.io/docs/reference/using-api/deprecation-guide/"
    },
    {
      "@type": "CreativeWork",
      "name": "Kubernetes v1.26: Electrifying (release announcement, 2022-12-09)",
      "url": "https://kubernetes.io/blog/2022/12/09/kubernetes-v1-26-release/"
    }
  ],
  "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/kubernetes.json",
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen"
  }
}
</script>
