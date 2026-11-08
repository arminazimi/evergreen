---
title: "AWS Lambda Node.js 22 runtime reaches end of life on 2027-04-30 — dates, impact, migration"
description: "The AWS Lambda runtimes table lists nodejs22.x as supported with a projected deprecation date of 2027-04-30. After that date AWS no longer applies security or other updates to that managed runtime."
layout: doc
permalink: "/rules/serverless.aws-lambda.nodejs22.x.html"
canonical_url: "https://arminazimi.github.io/evergreen/rules/serverless.aws-lambda.nodejs22.x.html"
image: "/assets/og/serverless.aws-lambda.nodejs22.x.svg"
review_date: "2026-10-30"
last_modified_at: "2026-10-30"
json_twin: "/rules/serverless.aws-lambda.nodejs22.x.json"
---

# AWS Lambda Node.js 22 runtime reaches end of life on 2027-04-30

**Scheduled end of life** as of 2027-04-30. Replacement: nodejs24.x. Source: [AWS Lambda runtimes](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html).

Check a version:

```bash
evergreen check pkg:generic/aws-lambda-runtime/nodejs22.x
```

The AWS Lambda runtimes table lists nodejs22.x as supported with a projected deprecation date of 2027-04-30. After that date AWS no longer applies security or other updates to that managed runtime.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Scheduled end of life |
| Severity | low |
| Ecosystem | `serverless` |
| Component | `pkg:generic/aws-lambda-runtime/nodejs22.x` |
| Affected versions | `vers:semver/*` |
| Date from the source | 2027-04-30 |
| Replacement | nodejs24.x |
| Evidence last seen | 2026-10-30 |
| Reviewed | 2026-10-30 by arminazimi |
| Review due | 2027-01-28 (90 days after the last review) |
| Rule ID | `serverless.aws-lambda.nodejs22.x` |

## Sources

- [AWS Lambda runtimes](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html) (accessed 2026-10-30)

## Migration

**Constraints**

- Keep provider.runtime, Globals.Function.Runtime, per-function Runtime, and Terraform aws_lambda_function.runtime on one AWS Lambda runtime identifier that AWS still supports.
- Raising the managed runtime can require Node.js language and dependency changes; confirm handlers and native modules run on the replacement before deploying.
- This runtime is still supported today; the rule is a warning ahead of the announced date, so plan the move before it.

**Steps**

1. **Raise the AWS Lambda runtime.** Change the reported Runtime (or provider.runtime / terraform runtime) from nodejs22.x to a supported AWS Lambda Node.js identifier (see the replacement).
2. **Align other runtime surfaces.** Update every other SAM/CloudFormation Globals or function Runtime, serverless.yml provider or function runtime, Terraform aws_lambda_function.runtime, and CI deploy config that still pins nodejs22.x.

**Verification**

- `sam validate || serverless print || terraform validate`: Validate the updated SAM, Serverless Framework, or Terraform declaration before deploy.

## Detected by

The `serverless` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Same ecosystem

- [AWS Lambda .NET 10 runtime reaches end of life on 2028-11-14](serverless.aws-lambda.dotnet10.html)
- [AWS Lambda .NET 5 (container only) runtime is end-of-life](serverless.aws-lambda.dotnet5.0.html)
- [AWS Lambda .NET 6 runtime is end-of-life](serverless.aws-lambda.dotnet6.html)
- [AWS Lambda .NET 7 (container only) runtime is end-of-life](serverless.aws-lambda.dotnet7.html)
- [AWS Lambda .NET 8 runtime reaches end of life on 2026-11-10](serverless.aws-lambda.dotnet8.html)
- [AWS Lambda .NET 9 (container only) runtime reaches end of life on 2026-11-10](serverless.aws-lambda.dotnet9.html)
- [AWS Lambda .NET Core 1.0 runtime is end-of-life](serverless.aws-lambda.dotnetcore1.0.html)
- [AWS Lambda .NET Core 2.0 runtime is end-of-life](serverless.aws-lambda.dotnetcore2.0.html)


## Data

This page is generated from [`registry/serverless.json`](https://github.com/arminazimi/evergreen/blob/main/registry/serverless.json), rule `serverless.aws-lambda.nodejs22.x`, in the `ebb.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/serverless.aws-lambda.nodejs22.x.html",
      "url": "https://arminazimi.github.io/evergreen/rules/serverless.aws-lambda.nodejs22.x.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/serverless.aws-lambda.nodejs22.x.html",
      "headline": "AWS Lambda Node.js 22 runtime reaches end of life on 2027-04-30 — dates, impact, migration",
      "description": "The AWS Lambda runtimes table lists nodejs22.x as supported with a projected deprecation date of 2027-04-30. After that date AWS no longer applies security or other updates to that managed runtime.",
      "inLanguage": "en",
      "dateModified": "2026-10-30",
      "keywords": [
        "scheduled-end-of-life",
        "serverless",
        "low"
      ],
      "about": {
        "@type": "Thing",
        "name": "AWS Lambda Node.js 22 runtime reaches end of life on 2027-04-30",
        "identifier": "pkg:generic/aws-lambda-runtime/nodejs22.x"
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
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/serverless.aws-lambda.nodejs22.x.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/serverless.aws-lambda.nodejs22.x.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/aws-lambda-runtime/nodejs22.x?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Scheduled end of life as of 2027-04-30. Affected versions: vers:semver/*. Source: AWS Lambda runtimes (https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/aws-lambda-runtime/nodejs22.x?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "nodejs24.x"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/aws-lambda-runtime/nodejs22.x?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/aws-lambda-runtime/nodejs22.x."
          }
        }
      ]
    }
  ]
}
</script>
