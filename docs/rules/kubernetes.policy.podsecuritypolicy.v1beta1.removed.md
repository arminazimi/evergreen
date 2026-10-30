---
title: "PodSecurityPolicy policy/v1beta1 is no longer served — dates, impact, migration"
description: "The Kubernetes Deprecated API Migration Guide states that the policy/v1beta1 API version of PodSecurityPolicy is no longer served as of v1.25, which was released on 2022-08-23."
canonical_url: "https://arminazimi.github.io/evergreen/rules/kubernetes.policy.podsecuritypolicy.v1beta1.removed.html"
json_twin: "/rules/kubernetes.policy.podsecuritypolicy.v1beta1.removed.json"
---

# PodSecurityPolicy policy/v1beta1 is no longer served

The Kubernetes Deprecated API Migration Guide states that the policy/v1beta1 API version of PodSecurityPolicy is no longer served as of v1.25, which was released on 2022-08-23.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Removed |
| Severity | high |
| Ecosystem | `kubernetes` |
| Component | `pkg:generic/kubernetes/policy/PodSecurityPolicy` |
| Affected versions | `vers:semver/1.0.0-beta.1` |
| Date from the source | 2022-08-23 |
| Replacement | Pod Security Admission or a 3rd party admission webhook |
| Evidence last seen | 2026-10-17 |
| Reviewed | 2026-10-17 by arminazimi |
| Review due | 2027-10-17 (365 days after the last review) |
| Rule ID | `kubernetes.policy.podsecuritypolicy.v1beta1.removed` |

## Sources

- [Kubernetes Deprecated API Migration Guide](https://kubernetes.io/docs/reference/using-api/deprecation-guide/)
- [Kubernetes v1.25: Combiner (release announcement, 2022-08-23)](https://kubernetes.io/blog/2022/08/23/kubernetes-v1-25-release/)

## Migration

**Constraints**

- PodSecurityPolicy has no drop-in replacement: the admission controller was removed together with the API, so the policy must be re-expressed.
- Decide the intended Pod Security Standard (privileged, baseline, or restricted) for each namespace the policy covered before changing anything.
- Remove Roles and ClusterRoles that grant `use` on the PodSecurityPolicy once it is gone.

**Steps**

1. **Choose a replacement policy.** Replace the PodSecurityPolicy with Pod Security Admission labels on the affected namespaces, or with a third-party admission webhook, as the Kubernetes migration guide describes.
2. **Remove references to the policy.** Delete the PodSecurityPolicy manifest and any Role or ClusterRole rule that grants `use` on it.

**Verification**

- `kubectl label --dry-run=server --overwrite ns --all pod-security.kubernetes.io/enforce=baseline`: Preview which existing pods would violate the chosen Pod Security Standard, without changing any namespace.
- `kubeconform -strict -summary <manifest-paths>`: Validate the remaining manifests against the target Kubernetes version.

## Detected by

The [`kubernetes`](../detectors/kubernetes.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/kubernetes.json`](https://github.com/arminazimi/evergreen/blob/main/registry/kubernetes.json), rule `kubernetes.policy.podsecuritypolicy.v1beta1.removed`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/kubernetes.policy.podsecuritypolicy.v1beta1.removed.html",
  "url": "https://arminazimi.github.io/evergreen/rules/kubernetes.policy.podsecuritypolicy.v1beta1.removed.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/kubernetes.policy.podsecuritypolicy.v1beta1.removed.html",
  "headline": "PodSecurityPolicy policy/v1beta1 is no longer served — dates, impact, migration",
  "description": "The Kubernetes Deprecated API Migration Guide states that the policy/v1beta1 API version of PodSecurityPolicy is no longer served as of v1.25, which was released on 2022-08-23.",
  "inLanguage": "en",
  "dateModified": "2026-10-17",
  "keywords": [
    "removed",
    "kubernetes",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "PodSecurityPolicy policy/v1beta1 is no longer served",
    "identifier": "pkg:generic/kubernetes/policy/PodSecurityPolicy"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Kubernetes Deprecated API Migration Guide",
      "url": "https://kubernetes.io/docs/reference/using-api/deprecation-guide/"
    },
    {
      "@type": "CreativeWork",
      "name": "Kubernetes v1.25: Combiner (release announcement, 2022-08-23)",
      "url": "https://kubernetes.io/blog/2022/08/23/kubernetes-v1-25-release/"
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
