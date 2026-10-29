---
title: What went end of life this week (2026-10-22 to 2026-10-28)
---

# What went end of life this week (2026-10-22 to 2026-10-28)

One lifecycle date passed in the Evergreen registry this week.

## GKE 1.31 is past end of extended support

Google Kubernetes Engine ended extended support for 1.31 on 2026-10-22. Standard support ended on 2026-01-16, and past extended support GKE no longer provides patches for the minor version. The registry recommends GKE 1.35 or later.

The scan reports a cluster on 1.31 when Terraform configuration pins that release for the control plane, either on a `google_container_cluster` or through a GKE module.

- **Date:** 2026-10-22
- **Ecosystem:** terraform
- **Severity:** high
- **Rule:** `terraform.gke.end-of-life-1.31`
- **Sources:** [GKE versioning and support](https://cloud.google.com/kubernetes-engine/versioning), [GKE release schedule](https://cloud.google.com/kubernetes-engine/docs/release-schedule)

If you run 1.31, raise the control plane and the node pools one minor version at a time, and replace APIs removed between 1.31 and the target before applying. The rule's migration steps cover both.

Every claim above comes from the linked sources and the reviewed rule. [Lifecycle rules](../RULES.md) explains how sources are reviewed, and the [lifecycle calendar](../EOL_CALENDAR.md) lists what ends next.
