# Serverless runtimes

The `serverless` detector reports managed serverless runtime identifiers that vendors list as end-of-life, as declared in AWS SAM / CloudFormation templates, Serverless Framework `serverless.yml`, and Terraform (including Azure Functions `application_stack` version pins). It is **stable**: its level is recorded as `stable` in `benchmarks/thresholds.json`, and the precision floor is enforced on the [public corpus](../VALIDATION.md#serverless-corpus). The maturity rules are in [Decision 0013](../decisions/0013-detector-maturity.md).

## What it reads

| File | Declaration |
| --- | --- |
| `template.yaml` / `template.yml` | Literal `Globals.Function.Runtime`, and each `Properties.Runtime` on an `AWS::Serverless::Function` or `AWS::Lambda::Function` |
| `serverless.yml` | Literal `provider.runtime` and each function's own `runtime` |
| `*.tf` | Literal `runtime` on `aws_lambda_function`, `google_cloudfunctions_function`, and `google_cloudfunctions2_function.build_config`; and version fields on `azurerm_*_function_app` `site_config.application_stack` (`node_version`, `python_version`, `java_version`, `powershell_core_version`, `dotnet_version`) |

Plain or quoted string scalars only. CloudFormation tags (`!Ref`, `!Sub`), Serverless `${…}` interpolations, Terraform `var` / `local` / interpolations, floating aliases such as `latest`, nested lookalike keys, heredocs, and image functions without a managed-runtime identifier are ignored. `serverless.yaml` is not read.

It walks the repository up to eight directories deep (at most 500 matching files) and does not follow symbolic links. It skips `.git`, `node_modules`, `vendor`, `dist`, `build`, `target`, `.venv`, `venv`, `fixtures`, `__fixtures__`, and `testdata`. SAM, the Serverless Framework, Terraform, and cloud CLIs are never run.

## What it reports

- A literal AWS Lambda runtime identifier that a `pkg:generic/aws-lambda-runtime/<id>` rule covers, citing the [AWS Lambda runtimes](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html) table.
- A literal Google Cloud Functions runtime identifier that a `pkg:generic/google-cloud-functions-runtime/<id>` rule covers, citing the [Cloud Run functions runtime support](https://cloud.google.com/functions/docs/runtime-support) schedule.
- An Azure Functions / App Service `application_stack` version pin (`node_version`, `python_version`, `java_version`, `dotnet_version`, `powershell_core_version`) on `azurerm_linux_function_app` / `azurerm_windows_function_app` when a `pkg:generic/azure-app-service/<stack>` rule covers that version, citing the [App Service language runtime support policy](https://learn.microsoft.com/en-us/azure/app-service/language-support-policy).

Each finding names the file and line, and carries its rule's source, replacement, deadline, migration guidance, and verification commands. There is no source-usage pass.

## What it intentionally does not judge

- Runtime identifiers with no rule in `registry/serverless.json`. A missing finding is not evidence that a runtime is current.
- CloudFormation intrinsic functions and tags, Serverless Framework variables, Terraform variables and interpolations, and floating aliases such as `latest`.
- CDK, Pulumi, SAM CLI `samconfig`, Serverless Framework `serverless.ts` / `serverless.js`, and Azure Function `function.json` / `host.json` app settings (Terraform `application_stack` pins are judged; app settings are not).
- Azure stack fields that are Terraform interpolations (`var` / `local` / dynamic blocks), and `node_version` only under `app_settings` or module variable type objects without a literal pin on the resource.
- Image-based Lambda or Cloud Functions deployments that omit a managed-runtime identifier.
- Vulnerability advisories and license policy.

## Known limits and false-positive boundaries

- A declared runtime is reported whatever the project actually deploys. A stale example under the repository root still produces a finding when it is within the walk limits.
- The identifier is matched as written. `nodejs14.x` is an AWS Lambda id; `nodejs14` is a Google Cloud Functions id. They do not substitute for each other.
- Malformed input produces no declarations from that file, never a partial result, and no error is raised. A file over 1 MiB yields nothing, and a single line over 4,096 characters is skipped. An unterminated string or comment in Terraform yields nothing from the whole file.
- The eight-level and 500-file limits are silent. Files beyond them, and any under `vendor` or a skipped directory, are not scanned.

## Data

The rules are in `registry/serverless.json` and ship in the [data bundle](../DATA.md). The importers `serverless-1` (AWS Lambda runtimes) and `serverless-2` (Google Cloud Functions runtime support) draft new rules for review; see [Lifecycle importers](../IMPORTERS.md).

## Validation

Forty-one public repositories at pinned commits cover the detector: seven targeted and thirty-four chosen blind by the rules in [Validation](../VALIDATION.md#serverless-blind-selection) (the 2026-10-21 beta walk plus the 2026-11-08 stable expansion). The set includes SAM `template.yaml`, Serverless Framework `serverless.yml`, Terraform AWS Lambda runtimes, and Azure `application_stack` pins. Each expected finding was reviewed by hand against the file at that commit. Corpus-wide evidence meets every stable count in [decision 0013](../decisions/0013-detector-maturity.md). Offline validate on the Serverless bucket reported precision 1 and recall 1 for `serverless`.
