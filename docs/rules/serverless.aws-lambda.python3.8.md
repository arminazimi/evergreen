---
title: "AWS Lambda Python 3.8 runtime is end-of-life — dates, impact, migration"
description: "The AWS Lambda runtimes table lists python3.8 under Deprecated runtimes with deprecation date 2024-10-14. AWS no longer applies security or other updates to that managed runtime."
canonical_url: "https://arminazimi.github.io/evergreen/rules/serverless.aws-lambda.python3.8.html"
---

# AWS Lambda Python 3.8 runtime is end-of-life

The AWS Lambda runtimes table lists python3.8 under Deprecated runtimes with deprecation date 2024-10-14. AWS no longer applies security or other updates to that managed runtime.

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `serverless` |
| Component | `pkg:generic/aws-lambda-runtime/python3.8` |
| Affected versions | `vers:semver/*` |
| Date from the source | 2024-10-14 |
| Replacement | python3.13 or python3.12 |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-01-19 (90 days after the last review) |
| Rule ID | `serverless.aws-lambda.python3.8` |

## Sources

- [AWS Lambda runtimes](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html) (accessed 2026-10-21)

## Migration

**Constraints**

- Keep provider.runtime, Globals.Function.Runtime, per-function Runtime, and Terraform aws_lambda_function.runtime on one AWS Lambda runtime identifier that AWS still supports.
- Raising the managed runtime can require Python language and dependency changes; confirm handlers and native modules run on the replacement before deploying.

**Steps**

1. **Raise the AWS Lambda runtime.** Change the reported Runtime (or provider.runtime / terraform runtime) from python3.8 to a supported AWS Lambda Python identifier (see the replacement).
2. **Align other runtime surfaces.** Update every other SAM/CloudFormation Globals or function Runtime, serverless.yml provider or function runtime, Terraform aws_lambda_function.runtime, and CI deploy config that still pins python3.8.

**Verification**

- `sam validate || serverless print || terraform validate`: Validate the updated SAM, Serverless Framework, or Terraform declaration before deploy.

## Detected by

The `serverless` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/serverless.json`](https://github.com/arminazimi/evergreen/blob/main/registry/serverless.json), rule `serverless.aws-lambda.python3.8`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/serverless.aws-lambda.python3.8.html",
  "url": "https://arminazimi.github.io/evergreen/rules/serverless.aws-lambda.python3.8.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/serverless.aws-lambda.python3.8.html",
  "headline": "AWS Lambda Python 3.8 runtime is end-of-life — dates, impact, migration",
  "description": "The AWS Lambda runtimes table lists python3.8 under Deprecated runtimes with deprecation date 2024-10-14. AWS no longer applies security or other updates to that managed runtime.",
  "inLanguage": "en",
  "dateModified": "2026-10-21",
  "keywords": [
    "end-of-life",
    "serverless",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "AWS Lambda Python 3.8 runtime is end-of-life",
    "identifier": "pkg:generic/aws-lambda-runtime/python3.8"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "AWS Lambda runtimes",
      "url": "https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html"
    }
  ],
  "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/serverless.json",
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen"
  }
}
</script>
