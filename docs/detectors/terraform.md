# Terraform

The `terraform` detector reports Terraform CLI release lines that are no longer supported, as declared in `*.tf`, `.terraform-version`, `.tool-versions`, and `terraform show -json` plan JSON files, reads locked provider versions from `.terraform.lock.hcl`, and judges managed Kubernetes control-plane versions on Amazon EKS, Google Kubernetes Engine, and Azure Kubernetes Service. It is **experimental**: it is not yet held to the precision floor that stable detectors are (see [Decision 0013](../decisions/0013-detector-maturity.md)). Its lifecycle rules are in `registry/terraform.json` and ship in the [data bundle](../DATA.md).

## What it reads

| File | Declaration |
| --- | --- |
| `*.tf` | `required_version` in a top-level `terraform` block, and `version` (with `source`) of each entry in `required_providers` |
| `*.tf` | Managed Kubernetes control-plane versions on supported resources and known modules (see [Managed Kubernetes](#managed-kubernetes)) |
| `.terraform.lock.hcl` | The locked `version` (and recorded `constraints`) of each top-level `provider "<address>"` block |
| `.terraform-version` | The single Terraform version used by tfenv and tenv |
| `.tool-versions` | The first version of the `terraform` entry (asdf and mise). `terraformer` and other tools are not read |
| `*plan*.json`, `*.tfplan.json` | Output from `terraform show -json` (at most 50 plan JSON files): resolved CLI `terraform_version`, provider version constraints in `provider_config` / `provider_requirements`, and resolved `engine` / `engine_version` on database resources |

It walks the repository up to eight directories deep (at most 500 `.tf` and version files, and at most 50 plan JSON files) and does not follow symbolic links. It skips `.git`, `.terraform` (the module and provider cache), `node_modules`, `vendor`, `dist`, `build`, `target`, `.venv`, `venv`, `fixtures`, `__fixtures__`, and `testdata`. Terraform and its version managers are never run, and nothing is fetched.

### Managed Kubernetes

| Block | Declaration | Product |
| --- | --- | --- |
| `google_container_cluster` | `min_master_version` | Google Kubernetes Engine |
| `azurerm_kubernetes_cluster` | `kubernetes_version` | Azure Kubernetes Service |
| `module` with `source = "terraform-aws-modules/eks/aws"` | `cluster_version` and `kubernetes_version` | Amazon EKS |
| `module` with `source = "Azure/aks/azurerm"` | `kubernetes_version` | Azure Kubernetes Service |
| `module` with `source = "terraform-google-modules/kubernetes-engine/google"` | `kubernetes_version` and `min_master_version` | Google Kubernetes Engine |

A module's vendor comes from its `source`, never from the attribute name: the EKS module renamed `cluster_version` to `kubernetes_version` in v21, so the same attribute name appears in EKS, AKS, and GKE modules. The source is matched without the default `registry.terraform.io/` host, without a `//submodule` path, and without a `?ref=` suffix or other query, and the match is case-insensitive. A module whose source is missing, is not one literal, or is not one of those addresses has its version attributes reported as unclassified instead of judged.

## What it reports

- A Terraform CLI version pinned in `.terraform-version` or `.tool-versions`, constrained in `required_version` (see below), or resolved in a plan JSON file (`/terraform_version`), that falls in a release line the rules mark as past end of support. HashiCorp supports the two most recent release lines, so a line loses support when the release two lines later ships. The bundled rules cover CLI lines 1.10 through 1.15, at **medium** or **high** severity. The support window is taken from endoflife.date and the dates of the `hashicorp/terraform` GitHub releases; the HashiCorp support-policy page is listed as a source but could not be read automatically when the rules were reviewed.
- A provider version constraint in `.terraform.lock.hcl`, `required_providers`, or plan JSON, when a reviewed rule covers it. The registry has no provider rules yet, so this produces findings only after one is added. Providers are matched as `pkg:generic/terraform-provider/<namespace>/<name>`, and only providers on `registry.terraform.io` are read.
- A managed Kubernetes control-plane version on a supported resource or a known module, when a rule for that product covers the version's minor line. The bundled rules cover EKS, GKE, and AKS lines 1.33 and earlier. A line past standard support is `end-of-support` at **medium** severity; one past extended or long-term support is `end-of-life` at **high** severity. A catch-all rule per product covers every older line.
- Resolved database `engine_version` on managed resources in a plan JSON file, judged against database runtime lifecycle rules.
- Plan JSON findings carry plan evidence: the file path plus the JSON pointer (e.g., `/terraform_version`) or resource address (e.g., `aws_db_instance.legacy_db`).

Each finding carries its rule's sources, replacement, migration steps, and verification commands. A CLI finding raises the CLI pin, `required_version`, and the CI toolchain; a managed Kubernetes finding raises the control plane and then the node pools. Every rule's verification includes `terraform init -backend=false && terraform validate` and `terraform plan`. The detector reports no source usages.

## How versions are matched

- An exact version (a version file, a lock entry, or a constraint written as `1.12.3` or `= 1.12.3`) uses the first rule whose `vers` range contains it. A rule whose `vers` is malformed is skipped, so it does not hide a later rule.
- A pessimistic patch constraint (`~> 1.12.0`) admits only the rest of one minor line, so it matches a rule that contains both ends of that line.
- Any other constraint (`>= 1.5`, `~> 1.9`, a comma-separated range) admits versions outside any single release line, so it is matched only against a rule that covers every version, and is never reported as an old release.
- A managed Kubernetes version is read as `major.minor` or `major.minor.patch` plus an optional suffix such as `-gke.1200`. A partial version such as `1.33` admits the whole `1.33` line, so it matches a rule only when the rule contains both ends of that line.
- The Terraform CLI is matched as `pkg:generic/terraform`; a managed Kubernetes product is matched as `pkg:generic/amazon-eks`, `pkg:generic/google-kubernetes-engine`, or `pkg:generic/azure-kubernetes-service`.

## What it intentionally does not judge

- `var.`, `local.`, interpolated, and function-call values, and any value that is not one literal string. For a managed Kubernetes attribute, such a value is listed as unclassified.
- A module whose `source` is missing or is not a known managed Kubernetes module: its `cluster_version`, `kubernetes_version`, and `min_master_version` are listed as unclassified, not judged.
- `aws_eks_cluster.version`, `google_container_cluster.version`, and node-pool versions (`aws_eks_node_group.version`, `google_container_node_pool.version`, and `azurerm_kubernetes_cluster_node_pool.orchestrator_version`). Only the module and resource attributes above are read.
- Comments, strings that mention `required_version`, and `version` attributes on modules, resources, variable defaults, and nested blocks.
- `latest`, `min-required`, `system`, `ref:`, `path:`, partial versions such as `1.12`, and a leading `v` in version files.
- `terraform` blocks that are nested inside another block, and providers on a registry other than `registry.terraform.io`.
- Vulnerability advisories, and whether a newer release or provider exists.
- Malformed or oversized files (over 1 MiB, or a line over 4,096 characters in HCL) produce nothing, not partial results: an unterminated string, comment, or heredoc makes the whole file return nothing, and an unclosed block is skipped.

## Known limits and false-positive boundaries

- A Terraform line is reported as past end of support even when the project still works on it; Evergreen reports that HashiCorp no longer supports it, not that it fails.
- A managed Kubernetes line in extended support (EKS and GKE) or long-term support (AKS) still receives patches but is reported as past standard support; the rule summary names the date the vendor page gives.
- A module source is matched by address only. A local path, a wrapper module, or a fork with the same address but different contents is not resolved, and a version passed through local variables is unclassified.
- HashiCorp's own end-of-support wording is not machine-readable. The release-date logic is reproduced by the `terraform-1` importer, which drafts rules from GitHub releases for review. The `terraform-2` importer reads the aws, azurerm, and google major upgrade guides but drafts no provider rule: those guides describe resource changes, not how long a provider version is supported.
- Every `*.tf` file is read on its own: `required_version` in different directories can differ, and findings in `examples/` or module directories are reported like any other.
- A repository with more than 500 matching files is read only up to that limit, in sorted path order.
