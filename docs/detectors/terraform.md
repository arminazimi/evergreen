# Terraform

The `terraform` detector reports Terraform CLI release lines that are no longer supported, as declared in `*.tf`, `.terraform-version`, `.tool-versions`, and `terraform show -json` plan JSON files, and reads locked provider versions from `.terraform.lock.hcl`. It is **experimental**: it is not yet held to the precision floor that stable detectors are (see [Decision 0013](../decisions/0013-detector-maturity.md)). Its lifecycle rules are in `registry/terraform.json` and ship in the [data bundle](../DATA.md).

## What it reads

| File | Declaration |
| --- | --- |
| `*.tf` | `required_version` in a top-level `terraform` block, and `version` (with `source`) of each entry in `required_providers` |
| `.terraform.lock.hcl` | The locked `version` (and recorded `constraints`) of each top-level `provider "<address>"` block |
| `.terraform-version` | The single Terraform version used by tfenv and tenv |
| `.tool-versions` | The first version of the `terraform` entry (asdf and mise). `terraformer` and other tools are not read |
| `*.json` | Output from `terraform show -json`: resolved CLI `terraform_version`, resolved `provider_config` / `provider_requirements`, and resolved `engine` / `engine_version` on database resources |

It walks the repository up to eight directories deep (at most 500 matching files) and does not follow symbolic links. It skips `.git`, `.terraform` (the module and provider cache), `node_modules`, `vendor`, `dist`, `build`, `target`, `.venv`, `venv`, `fixtures`, `__fixtures__`, and `testdata`. Terraform and its version managers are never run, and nothing is fetched.

## What it reports

- A Terraform CLI version pinned in `.terraform-version` or `.tool-versions`, constrained in `required_version` (see below), or resolved in a plan JSON file (`/terraform_version`), that falls in a release line the rules mark as past end of support. HashiCorp supports the two most recent release lines, so a line loses support when the release two lines later ships. The bundled rules cover CLI lines 1.10 through 1.14, at **medium** or **high** severity. The support window is taken from endoflife.date and the dates of the `hashicorp/terraform` GitHub releases; the HashiCorp support-policy page is listed as a source but could not be read automatically when the rules were reviewed.
- A provider version in `.terraform.lock.hcl`, `required_providers`, or plan JSON, when a reviewed rule covers it. The registry has no provider rules yet, so this produces findings only after one is added. Providers are matched as `pkg:generic/terraform-provider/<namespace>/<name>`, and only providers on `registry.terraform.io` are read.
- Resolved database `engine_version` on managed resources in a plan JSON file, judged against database runtime lifecycle rules.
- Plan JSON findings carry plan evidence: the file path plus the JSON pointer (e.g., `/terraform_version`) or resource address (e.g., `aws_db_instance.legacy_db`).

Each finding carries its rule's sources, replacement, migration steps, and verification commands: raise the CLI pin, raise `required_version`, and align CI; then `terraform version`, `terraform init -backend=false && terraform validate`, and `terraform plan`. The detector reports no source usages.

## How versions are matched

- An exact version (a version file, a lock entry, or a constraint written as `1.12.3` or `= 1.12.3`) uses the first rule whose `vers` range contains it. A rule whose `vers` is malformed is skipped, so it does not hide a later rule.
- A pessimistic patch constraint (`~> 1.12.0`) admits only the rest of one minor line, so it matches a rule that contains both ends of that line.
- Any other constraint (`>= 1.5`, `~> 1.9`, a comma-separated range) admits versions outside any single release line, so it is matched only against a rule that covers every version, and is never reported as an old release.
- The Terraform CLI is matched as `pkg:generic/terraform`.

## What it intentionally does not judge

- `var.`, `local.`, interpolated, and function-call values, and any value that is not one literal string.
- Comments, strings that mention `required_version`, and `version` attributes on modules, resources, variable defaults, and nested blocks.
- `latest`, `min-required`, `system`, `ref:`, `path:`, partial versions such as `1.12`, and a leading `v` in version files.
- `terraform` blocks that are nested inside another block, and providers on a registry other than `registry.terraform.io`.
- Vulnerability advisories, and whether a newer release or provider exists.
- Malformed or oversized files (over 1 MiB, or a line over 4,096 characters in HCL) produce nothing, not partial results: an unterminated string, comment, or heredoc makes the whole file return nothing, and an unclosed block is skipped.

## Known limits and false-positive boundaries

- A Terraform line is reported as past end of support even when the project still works on it; Evergreen reports that HashiCorp no longer supports it, not that it fails.
- HashiCorp's own end-of-support wording is not machine-readable. The release-date logic is reproduced by the `terraform-1` importer, which drafts rules from GitHub releases for review. The `terraform-2` importer reads the aws, azurerm, and google major upgrade guides but drafts no provider rule: those guides describe resource changes, not how long a provider version is supported.
- Every `*.tf` file is read on its own: `required_version` in different directories can differ, and findings in `examples/` or module directories are reported like any other.
- A repository with more than 500 matching files is read only up to that limit, in sorted path order.
