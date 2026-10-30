---
title: "AWS Lambda Node.js 14 runtime is end-of-life — dates, impact, migration"
description: "The AWS Lambda runtimes table lists nodejs14.x under Deprecated runtimes with deprecation date 2023-12-04. AWS no longer applies security or other updates to that managed runtime."
canonical_url: "https://arminazimi.github.io/evergreen/rules/serverless.aws-lambda.nodejs14.x.html"
json_twin: "/rules/serverless.aws-lambda.nodejs14.x.json"
---

# AWS Lambda Node.js 14 runtime is end-of-life

The AWS Lambda runtimes table lists nodejs14.x under Deprecated runtimes with deprecation date 2023-12-04. AWS no longer applies security or other updates to that managed runtime.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `serverless` |
| Component | `pkg:generic/aws-lambda-runtime/nodejs14.x` |
| Affected versions | `vers:semver/*` |
| Date from the source | 2023-12-04 |
| Replacement | nodejs22.x or nodejs24.x |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-01-19 (90 days after the last review) |
| Rule ID | `serverless.aws-lambda.nodejs14.x` |

## Sources

- [AWS Lambda runtimes](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html) (accessed 2026-10-21)

## Migration

**Constraints**

- Keep provider.runtime, Globals.Function.Runtime, per-function Runtime, and Terraform aws_lambda_function.runtime on one AWS Lambda runtime identifier that AWS still supports.
- Raising the managed runtime can require Node.js language and dependency changes; confirm handlers and native modules run on the replacement before deploying.

**Steps**

1. **Raise the AWS Lambda runtime.** Change the reported Runtime (or provider.runtime / terraform runtime) from nodejs14.x to a supported AWS Lambda Node.js identifier (see the replacement).
2. **Align other runtime surfaces.** Update every other SAM/CloudFormation Globals or function Runtime, serverless.yml provider or function runtime, Terraform aws_lambda_function.runtime, and CI deploy config that still pins nodejs14.x.

**Verification**

- `sam validate || serverless print || terraform validate`: Validate the updated SAM, Serverless Framework, or Terraform declaration before deploy.

## Detected by

The `serverless` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/serverless.json`](https://github.com/arminazimi/evergreen/blob/main/registry/serverless.json), rule `serverless.aws-lambda.nodejs14.x`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/serverless.aws-lambda.nodejs14.x.html",
  "url": "https://arminazimi.github.io/evergreen/rules/serverless.aws-lambda.nodejs14.x.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/serverless.aws-lambda.nodejs14.x.html",
  "headline": "AWS Lambda Node.js 14 runtime is end-of-life — dates, impact, migration",
  "description": "The AWS Lambda runtimes table lists nodejs14.x under Deprecated runtimes with deprecation date 2023-12-04. AWS no longer applies security or other updates to that managed runtime.",
  "inLanguage": "en",
  "dateModified": "2026-10-21",
  "keywords": [
    "end-of-life",
    "serverless",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "AWS Lambda Node.js 14 runtime is end-of-life",
    "identifier": "pkg:generic/aws-lambda-runtime/nodejs14.x"
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
