---
title: "Google Cloud Functions Go 1.13 runtime is end-of-life — dates, impact, migration"
description: "The Cloud Run functions runtime support schedule lists Go 1.13 (runtime ID go113) as deprecated on 2024-01-30 and decommissioned on 2025-01-30. Google no longer provides maintenance for that runtime."
layout: doc
permalink: "/rules/serverless.google-cloud-functions.go113.html"
canonical_url: "https://arminazimi.github.io/evergreen/rules/serverless.google-cloud-functions.go113.html"
image: "/assets/og/serverless.google-cloud-functions.go113.svg"
review_date: "2026-10-30"
last_modified_at: "2026-10-30"
json_twin: "/rules/serverless.google-cloud-functions.go113.json"
---

# Google Cloud Functions Go 1.13 runtime is end-of-life

**End of life** as of 2025-01-30. Replacement: go126 or go127. Source: [Cloud Run functions runtime support](https://cloud.google.com/functions/docs/runtime-support).

Check a version:

```bash
evergreen check pkg:generic/google-cloud-functions-runtime/go113
```

The Cloud Run functions runtime support schedule lists Go 1.13 (runtime ID go113) as deprecated on 2024-01-30 and decommissioned on 2025-01-30. Google no longer provides maintenance for that runtime.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `serverless` |
| Component | `pkg:generic/google-cloud-functions-runtime/go113` |
| Affected versions | `vers:semver/*` |
| Date from the source | 2025-01-30 |
| Replacement | go126 or go127 |
| Evidence last seen | 2026-10-30 |
| Reviewed | 2026-10-30 by arminazimi |
| Review due | 2027-01-28 (90 days after the last review) |
| Rule ID | `serverless.google-cloud-functions.go113` |

## Sources

- [Cloud Run functions runtime support](https://cloud.google.com/functions/docs/runtime-support) (accessed 2026-10-30)

## Migration

**Constraints**

- Keep every Terraform google_cloudfunctions*_function runtime on one Google Cloud Functions runtime ID that Google still supports.
- Raising the managed runtime can require language and dependency changes; confirm handlers run on the replacement before deploying.

**Steps**

1. **Raise the Google Cloud Functions runtime.** Change the reported runtime to a supported Google Cloud Functions runtime ID (see the replacement).
2. **Align other runtime surfaces.** Update every other Terraform google_cloudfunctions*_function runtime and deploy configuration that still pins the old runtime ID.

**Verification**

- `terraform init -backend=false && terraform validate`: Initialize without touching remote state and check that the configuration is valid.
- `terraform plan`: Review the plan and confirm the runtime change is the intended one.

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

This page is generated from [`registry/serverless.json`](https://github.com/arminazimi/evergreen/blob/main/registry/serverless.json), rule `serverless.google-cloud-functions.go113`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/serverless.google-cloud-functions.go113.html",
      "url": "https://arminazimi.github.io/evergreen/rules/serverless.google-cloud-functions.go113.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/serverless.google-cloud-functions.go113.html",
      "headline": "Google Cloud Functions Go 1.13 runtime is end-of-life — dates, impact, migration",
      "description": "The Cloud Run functions runtime support schedule lists Go 1.13 (runtime ID go113) as deprecated on 2024-01-30 and decommissioned on 2025-01-30. Google no longer provides maintenance for that runtime.",
      "inLanguage": "en",
      "dateModified": "2026-10-30",
      "keywords": [
        "end-of-life",
        "serverless",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "Google Cloud Functions Go 1.13 runtime is end-of-life",
        "identifier": "pkg:generic/google-cloud-functions-runtime/go113"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Cloud Run functions runtime support",
          "url": "https://cloud.google.com/functions/docs/runtime-support"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/serverless.google-cloud-functions.go113.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/serverless.google-cloud-functions.go113.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/google-cloud-functions-runtime/go113?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life as of 2025-01-30. Affected versions: vers:semver/*. Source: Cloud Run functions runtime support (https://cloud.google.com/functions/docs/runtime-support)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/google-cloud-functions-runtime/go113?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "go126 or go127"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/google-cloud-functions-runtime/go113?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/google-cloud-functions-runtime/go113."
          }
        }
      ]
    }
  ]
}
</script>
