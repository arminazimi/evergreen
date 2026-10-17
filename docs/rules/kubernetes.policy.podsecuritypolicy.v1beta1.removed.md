---
title: "PodSecurityPolicy policy/v1beta1 is no longer served"
description: "The Kubernetes Deprecated API Migration Guide states that the policy/v1beta1 API version of PodSecurityPolicy is no longer served as of v1.25, which was released on 2022-08-23."
---

# PodSecurityPolicy policy/v1beta1 is no longer served

The Kubernetes Deprecated API Migration Guide states that the policy/v1beta1 API version of PodSecurityPolicy is no longer served as of v1.25, which was released on 2022-08-23.

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

This page is generated from [`registry/kubernetes.json`](https://github.com/arminazimi/evergreen/blob/main/registry/kubernetes.json), rule `kubernetes.policy.podsecuritypolicy.v1beta1.removed`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
