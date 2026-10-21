# Terraform fixtures

These fixtures define the parser boundary for Terraform version declarations in [issue #400](https://github.com/arminazimi/evergreen/issues/400). The scope is the `terraform` block's `required_version` in `main.tf`, the AWS provider `version` in `.terraform.lock.hcl`, and the version files `.terraform-version` and `.tool-versions` (the `terraform` entry). Line numbers below are 1-based. Versions are parser examples: they do not claim that any Terraform or provider release is unsupported. There is no Terraform detector or rule yet, so the positive files produce no findings today. A lifecycle finding needs a reviewed rule with an authoritative source.

| Fixture file | Expected case |
| --- | --- |
| `positive/main.tf` | `required_version` `~> 0.12.31` (line 2) inside `terraform`, and the AWS provider `version` `~> 3.0` (line 7). `source` (line 6) is not a version declaration. |
| `positive/.terraform.lock.hcl` | The AWS provider `version` `3.74.0` (line 5). `constraints` (line 6) is recorded for the same provider. |
| `positive/.terraform-version` | A single version `0.12.31` (line 1). |
| `positive/.tool-versions` | `terraform 0.12.31` (line 1). `nodejs 22.11.0` (line 2) is not a Terraform declaration. |
| `negative/main.tf` | A commented-out `required_version` (lines 1–3), a `variable` default `"0.12.31"` (line 7), `required_version = var.terraform_version` (line 11), a provider `version = local.aws_provider_version` (line 16), a module `version` `3.0.0` (line 23), an `aws_eks_cluster` `version` `1.13` (line 28), and a string that mentions `required_version` (line 33) produce no declarations. |
| `negative/.terraform.lock.hcl` | Every line is a comment (lines 1–6), including a commented-out provider `version` (line 5). No declarations. |
| `negative/.terraform-version` | `latest` (line 1) is not a version. No declarations. |
| `negative/.tool-versions` | A comment (line 1), `nodejs 14.21.3` (line 2), and `terraformer 0.12.31` (line 3), where `terraformer` is a different tool. No declarations. |
| `zero/main.tf` | `required_version` `~> 1.9.0` (line 2) and the AWS provider `version` `~> 5.0` (line 7): valid declarations, no lifecycle finding. |
| `zero/.terraform.lock.hcl` | The AWS provider `version` `5.70.0` (line 5): a valid declaration, no lifecycle finding. |
| `zero/.terraform-version` | A single version `1.9.8` (line 1): a valid declaration, no lifecycle finding. |
| `zero/.tool-versions` | `terraform 1.9.8` (line 1): a valid declaration, no lifecycle finding. `nodejs 22.11.0` (line 2) is not a Terraform declaration. |
| `malformed/main.tf` | An unterminated string on `required_version` (line 2). The `terraform` block is never closed. No partial declaration, no error. |
| `malformed/.terraform.lock.hcl` | The `provider` block opened on line 3 is never closed. No partial declaration, no error. |
| `malformed/.tool-versions` | `terraform` with no version (line 1). No declaration, no error. |

Terraform `var`, `local`, and interpolated values are dynamic and are not declarations. Comments and strings that mention a version key are not declarations. Module, resource, and variable-default `version` attributes are not Terraform version declarations.
