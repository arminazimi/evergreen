---
title: "Is your repo affected? AWS Lambda .NET 8 and .NET 9 runtimes reach end of life on 2026-11-10"
---

# Is your repo affected? AWS Lambda .NET 8 and .NET 9 runtimes reach end of life on 2026-11-10

The AWS Lambda runtimes table lists **dotnet8** and **dotnet9** (container only) as supported with a projected deprecation date of **2026-11-10**. After that date AWS no longer applies security or other updates to those managed runtimes. The same date is also the end of support for .NET 8 and .NET 9 themselves, so raising the Lambda runtime and raising the target framework are one decision, not two.

## Who is affected

Repositories that declare a literal `dotnet8` or `dotnet9` runtime for an AWS Lambda function: `Globals.Function.Runtime` or a `Properties.Runtime` on an `AWS::Serverless::Function` or `AWS::Lambda::Function` in `template.yaml`/`template.yml`, `provider.runtime` or a per-function `runtime` in `serverless.yml`, or `runtime` on a Terraform `aws_lambda_function`. The [`serverless`](../detectors/serverless.md) detector reports those declarations; the [`dotnet`](../detectors/dotnet.md) detector reports the project files and SDK pins behind them. CloudFormation intrinsic functions, Serverless `${…}` interpolations, and Terraform variables are not judged, so only literal identifiers produce a finding.

## Check your repository

```bash
npx evergreen-deprecation scan
```

Look for rules `serverless.aws-lambda.dotnet8` and `serverless.aws-lambda.dotnet9`, and for `dotnet.runtime.end-of-support-8.0` and `dotnet.runtime.end-of-support-9.0` on the project side.

## Migration steps

Replacement: `dotnet10`.

1. **Raise the runtime.** Change the reported `Runtime` (or `provider.runtime` / Terraform `runtime`) from `dotnet8` or `dotnet9` to the `dotnet10` identifier.
2. **Confirm the project targets the replacement first.** Raising the managed runtime can require .NET target framework and package updates; confirm the project targets the replacement before deploying.
3. **Align other runtime surfaces.** Update every other SAM/CloudFormation `Globals` or function `Runtime`, `serverless.yml` provider or function runtime, Terraform `aws_lambda_function.runtime`, and CI deploy config that still pins `dotnet8` or `dotnet9`.

Then verify with `sam validate || serverless print || terraform validate`. Full constraints and verification commands are on the [dotnet8 rule page](../rules/serverless.aws-lambda.dotnet8.md) and the [dotnet9 rule page](../rules/serverless.aws-lambda.dotnet9.md).

## Sources

- [AWS Lambda runtimes](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html)
- Rules: [`serverless.aws-lambda.dotnet8`](../rules/serverless.aws-lambda.dotnet8.md), [`serverless.aws-lambda.dotnet9`](../rules/serverless.aws-lambda.dotnet9.md), [`dotnet.runtime.end-of-support-8.0`](../rules/dotnet.runtime.end-of-support-8.0.md), [`dotnet.runtime.end-of-support-9.0`](../rules/dotnet.runtime.end-of-support-9.0.md)

Every claim above comes from the linked source and the reviewed rules. The [lifecycle calendar](../EOL_CALENDAR.md) lists what ends next.
