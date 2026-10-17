---
title: "CronJob batch/v1beta1 is no longer served"
description: "The Kubernetes Deprecated API Migration Guide states that the batch/v1beta1 API version of CronJob is no longer served as of v1.25, which was released on 2022-08-23."
---

# CronJob batch/v1beta1 is no longer served

The Kubernetes Deprecated API Migration Guide states that the batch/v1beta1 API version of CronJob is no longer served as of v1.25, which was released on 2022-08-23.

| | |
| --- | --- |
| Status | Removed |
| Severity | high |
| Ecosystem | `kubernetes` |
| Component | `pkg:generic/kubernetes/batch/CronJob` |
| Affected versions | `vers:semver/1.0.0-beta.1` |
| Date from the source | 2022-08-23 |
| Replacement | batch/v1 CronJob, available since v1.21 |
| Evidence last seen | 2026-10-17 |
| Reviewed | 2026-10-17 by arminazimi |
| Review due | 2027-10-17 (365 days after the last review) |
| Rule ID | `kubernetes.batch.cronjob.v1beta1.removed` |

## Sources

- [Kubernetes Deprecated API Migration Guide](https://kubernetes.io/docs/reference/using-api/deprecation-guide/)
- [Kubernetes v1.25: Combiner (release announcement, 2022-08-23)](https://kubernetes.io/blog/2022/08/23/kubernetes-v1-25-release/)

## Migration

**Constraints**

- Keep the schedule, job template, and concurrency and history settings unchanged.
- The migration guide lists no notable changes between batch/v1beta1 and batch/v1 for CronJob.

**Steps**

1. **Change the CronJob apiVersion.** Change the reported `apiVersion` to `batch/v1` and adjust the fields below that differ between the two versions.
2. **Align other CronJob declarations.** Update every other manifest, Helm template, and kustomize patch or target that names the old API version of CronJob, so the repository agrees.

**Verification**

- `kubeconform -strict -summary <manifest-paths>`: Validate the migrated manifests against the schemas of the target Kubernetes version.
- `kubectl apply --dry-run=server -f <manifest-path>`: Ask a cluster on the target version to accept the migrated manifest without applying it.
- `helm template <chart-path> | kubeconform -strict -`: For a Helm chart, render it and validate the output.

## Detected by

The [`kubernetes`](../detectors/kubernetes.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/kubernetes.json`](https://github.com/arminazimi/evergreen/blob/main/registry/kubernetes.json), rule `kubernetes.batch.cronjob.v1beta1.removed`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
