---
title: "AWS Lambda Python 3.7 runtime is end-of-life — dates, impact, migration"
description: "The AWS Lambda runtimes table lists python3.7 under Deprecated runtimes with deprecation date 2023-12-04. AWS no longer applies security or other updates to that managed runtime."
canonical_url: "https://arminazimi.github.io/evergreen/rules/serverless.aws-lambda.python3.7.html"
json_twin: "/rules/serverless.aws-lambda.python3.7.json"
---

# AWS Lambda Python 3.7 runtime is end-of-life

**End of life** as of 2023-12-04. Replacement: python3.14 or python3.13. Source: [AWS Lambda runtimes](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html).

Check a version:

```bash
evergreen check pkg:generic/aws-lambda-runtime/python3.7
```

The AWS Lambda runtimes table lists python3.7 under Deprecated runtimes with deprecation date 2023-12-04. AWS no longer applies security or other updates to that managed runtime.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `serverless` |
| Component | `pkg:generic/aws-lambda-runtime/python3.7` |
| Affected versions | `vers:semver/*` |
| Date from the source | 2023-12-04 |
| Replacement | python3.14 or python3.13 |
| Evidence last seen | 2026-10-29 |
| Reviewed | 2026-10-29 by arminazimi |
| Review due | 2027-01-27 (90 days after the last review) |
| Rule ID | `serverless.aws-lambda.python3.7` |

## Sources

- [AWS Lambda runtimes](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html) (accessed 2026-10-29)

## Migration

**Constraints**

- Keep provider.runtime, Globals.Function.Runtime, per-function Runtime, and Terraform aws_lambda_function.runtime on one AWS Lambda runtime identifier that AWS still supports.
- Raising the managed runtime can require Python language and dependency changes; confirm handlers and native modules run on the replacement before deploying.

**Steps**

1. **Raise the AWS Lambda runtime.** Change the reported Runtime (or provider.runtime / terraform runtime) from python3.7 to a supported AWS Lambda Python identifier (see the replacement).
2. **Align other runtime surfaces.** Update every other SAM/CloudFormation Globals or function Runtime, serverless.yml provider or function runtime, Terraform aws_lambda_function.runtime, and CI deploy config that still pins python3.7.

**Verification**

- `sam validate || serverless print || terraform validate`: Validate the updated SAM, Serverless Framework, or Terraform declaration before deploy.

## Detected by

The `serverless` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Same ecosystem

- [AWS Lambda .NET Core 3.1 runtime is end-of-life](serverless.aws-lambda.dotnetcore3.1.html)
- [AWS Lambda Node.js 12 runtime is end-of-life](serverless.aws-lambda.nodejs12.x.html)
- [AWS Lambda Node.js 14 runtime is end-of-life](serverless.aws-lambda.nodejs14.x.html)
- [AWS Lambda Python 3.8 runtime is end-of-life](serverless.aws-lambda.python3.8.html)
- [AWS Lambda Ruby 2.7 runtime is end-of-life](serverless.aws-lambda.ruby2.7.html)
- [Google Cloud Functions Node.js 14 runtime is end-of-life](serverless.google-cloud-functions.nodejs14.html)


## Data

This page is generated from [`registry/serverless.json`](https://github.com/arminazimi/evergreen/blob/main/registry/serverless.json), rule `serverless.aws-lambda.python3.7`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/serverless.aws-lambda.python3.7.html",
      "url": "https://arminazimi.github.io/evergreen/rules/serverless.aws-lambda.python3.7.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/serverless.aws-lambda.python3.7.html",
      "headline": "AWS Lambda Python 3.7 runtime is end-of-life — dates, impact, migration",
      "description": "The AWS Lambda runtimes table lists python3.7 under Deprecated runtimes with deprecation date 2023-12-04. AWS no longer applies security or other updates to that managed runtime.",
      "inLanguage": "en",
      "dateModified": "2026-10-29",
      "keywords": [
        "end-of-life",
        "serverless",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "AWS Lambda Python 3.7 runtime is end-of-life",
        "identifier": "pkg:generic/aws-lambda-runtime/python3.7"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/serverless.aws-lambda.python3.7.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/serverless.aws-lambda.python3.7.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/aws-lambda-runtime/python3.7?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life as of 2023-12-04. Affected versions: vers:semver/*. Source: AWS Lambda runtimes (https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/aws-lambda-runtime/python3.7?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "python3.14 or python3.13"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/aws-lambda-runtime/python3.7?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/aws-lambda-runtime/python3.7."
          }
        }
      ]
    }
  ]
}
</script>
