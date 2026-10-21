---
title: "AWS Lambda Ruby 2.7 runtime is end-of-life — dates, impact, migration"
description: "The AWS Lambda runtimes table lists ruby2.7 under Deprecated runtimes with deprecation date 2023-12-07. AWS no longer applies security or other updates to that managed runtime."
canonical_url: "https://arminazimi.github.io/evergreen/rules/serverless.aws-lambda.ruby2.7.html"
---

# AWS Lambda Ruby 2.7 runtime is end-of-life

The AWS Lambda runtimes table lists ruby2.7 under Deprecated runtimes with deprecation date 2023-12-07. AWS no longer applies security or other updates to that managed runtime.

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `serverless` |
| Component | `pkg:generic/aws-lambda-runtime/ruby2.7` |
| Affected versions | `vers:semver/*` |
| Date from the source | 2023-12-07 |
| Replacement | ruby3.4 or ruby3.3 |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-01-19 (90 days after the last review) |
| Rule ID | `serverless.aws-lambda.ruby2.7` |

## Sources

- [AWS Lambda runtimes](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html)

## Detected by

No built-in detector reads `serverless` declarations yet; the rule is data in the [lifecycle registry](https://github.com/arminazimi/evergreen/blob/main/registry/serverless.json).

## Data

This page is generated from [`registry/serverless.json`](https://github.com/arminazimi/evergreen/blob/main/registry/serverless.json), rule `serverless.aws-lambda.ruby2.7`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/serverless.aws-lambda.ruby2.7.html",
  "url": "https://arminazimi.github.io/evergreen/rules/serverless.aws-lambda.ruby2.7.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/serverless.aws-lambda.ruby2.7.html",
  "headline": "AWS Lambda Ruby 2.7 runtime is end-of-life — dates, impact, migration",
  "description": "The AWS Lambda runtimes table lists ruby2.7 under Deprecated runtimes with deprecation date 2023-12-07. AWS no longer applies security or other updates to that managed runtime.",
  "inLanguage": "en",
  "dateModified": "2026-10-21",
  "keywords": [
    "end-of-life",
    "serverless",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "AWS Lambda Ruby 2.7 runtime is end-of-life",
    "identifier": "pkg:generic/aws-lambda-runtime/ruby2.7"
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
