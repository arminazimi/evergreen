---
title: "Is your repo affected? AKS 1.34 leaves its 12-month support window on 2026-11-30"
---

# Is your repo affected? AKS 1.34 leaves its 12-month support window on 2026-11-30

Azure Kubernetes Service supports a generally available Kubernetes version for 12 months. The AKS supported-versions page gives **AKS 1.34** an end of life of **2026-11-30**, with long-term support, which must be enabled for the cluster, ending on **2027-11-30**. A 1.34 cluster without long-term support therefore stops receiving patches after 2026-11-30.

## Who is affected

Teams running an AKS cluster on the 1.34 line. Evergreen judges what is deployed through [inventory](../INVENTORY.md): run `az aks list -o json > aks-clusters.json` yourself and hand the file to `evergreen inventory` (Evergreen never calls the Azure API). The Azure importer reads `kubernetesVersion` and each `agentPoolProfiles[].orchestratorVersion` and matches them to the `pkg:generic/azure-aks` rules; the Terraform state importer maps an `azurerm_kubernetes_cluster` `kubernetes_version` in a state export to the same rules. One honest gap: a `kubernetes_version = "1.34.x"` pin in a plain `*.tf` file is not a scan finding yet, because the `terraform` detector's AKS rules in the registry cover 1.33 and older lines only — the registry has no scheduled 1.34 rule for that declaration surface.

## Check your cluster and repository

```bash
npx evergreen-deprecation inventory aks-clusters.json
npx evergreen-deprecation check pkg:generic/azure-aks
```

Look for rule `kubernetes.azure-aks.1-34`.

## Migration steps

Replacement: Azure Kubernetes Service 1.35 or later.

1. **Read the upgrade notes for every minor version crossed**, then raise the control plane with `az aks upgrade`. AKS upgrades one minor version at a time and upgrades the control plane before the agent pools.
2. **Raise the agent pools.** Run `az aks nodepool upgrade` for each agent pool so every pool reports the new orchestrator version; a pool cannot run a newer version than its control plane.
3. **Align the cluster declaration.** Set `kubernetes_version` and each node pool `orchestrator_version` in the Terraform, Bicep, or Azure Resource Manager definition of the cluster to the same replacement version.
4. **Remove APIs the new version deleted.** Read the Kubernetes deprecation guide for every minor version crossed and replace removed API versions in manifests and Helm charts before applying.

Then verify with `kubectl version` and `kubectl get nodes -o wide`. Full constraints and verification commands are on the [rule page](../rules/kubernetes.azure-aks.1-34.md).

## Sources

- [Supported Kubernetes versions in Azure Kubernetes Service (AKS)](https://learn.microsoft.com/en-us/azure/aks/supported-kubernetes-versions)
- Rules: [`kubernetes.azure-aks.1-34`](../rules/kubernetes.azure-aks.1-34.md)

Every claim above comes from the linked source and the reviewed rule. The [lifecycle calendar](../EOL_CALENDAR.md) lists what ends next.
