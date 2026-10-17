---
title: "Ingress networking.k8s.io/v1beta1 is no longer served"
description: "The Kubernetes Deprecated API Migration Guide states that the networking.k8s.io/v1beta1 API version of Ingress is no longer served as of v1.22, which was released on 2021-08-04."
---

# Ingress networking.k8s.io/v1beta1 is no longer served

The Kubernetes Deprecated API Migration Guide states that the networking.k8s.io/v1beta1 API version of Ingress is no longer served as of v1.22, which was released on 2021-08-04.

| | |
| --- | --- |
| Status | Removed |
| Severity | high |
| Ecosystem | `kubernetes` |
| Component | `pkg:generic/kubernetes/networking.k8s.io/Ingress` |
| Affected versions | `vers:semver/1.0.0-beta.1` |
| Date from the source | 2021-08-04 |
| Replacement | networking.k8s.io/v1 Ingress, available since v1.19 |
| Evidence last seen | 2026-10-17 |
| Reviewed | 2026-10-17 by arminazimi |
| Review due | 2027-10-17 (365 days after the last review) |
| Rule ID | `kubernetes.networking-k8s-io.ingress.v1beta1.removed` |

## Sources

- [Kubernetes Deprecated API Migration Guide](https://kubernetes.io/docs/reference/using-api/deprecation-guide/)
- [Kubernetes 1.22: Reaching New Peaks (release announcement, 2021-08-04)](https://kubernetes.io/blog/2021/08/04/kubernetes-1-22-release-announcement/)

## Migration

**Constraints**

- Keep routing behavior unchanged: the same hosts, paths, and backends.
- In networking.k8s.io/v1, spec.backend is renamed spec.defaultBackend, and each backend's serviceName and servicePort become service.name and service.port.number (or service.port.name for a named port).
- pathType is required on every path in networking.k8s.io/v1; use ImplementationSpecific to keep the old undefined behavior, or Prefix or Exact if that is what was intended.
- If an Ingress is selected by an ingress class annotation, check the IngressClass resource still matches.

**Steps**

1. **Change the Ingress apiVersion.** Change the reported `apiVersion` to `networking.k8s.io/v1`.
2. **Rewrite backends and paths.** Rename spec.backend to spec.defaultBackend, convert serviceName and servicePort to the service.name and service.port forms, and add a pathType to every path.
3. **Align other Ingress declarations.** Update every other manifest, Helm template, and kustomize patch or target that names the old Ingress API version, so the repository agrees.

**Verification**

- `kubeconform -strict -summary <manifest-paths>`: Validate the migrated manifests against the schemas of the target Kubernetes version.
- `kubectl apply --dry-run=server -f <manifest-path>`: Ask a cluster on the target version to accept the migrated manifest without applying it.
- `helm template <chart-path> | kubeconform -strict -`: For a Helm chart, render it and validate the output.

## Detected by

The [`kubernetes`](../detectors/kubernetes.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/kubernetes.json`](https://github.com/arminazimi/evergreen/blob/main/registry/kubernetes.json), rule `kubernetes.networking-k8s-io.ingress.v1beta1.removed`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
