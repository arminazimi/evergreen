---
title: "App Engine Python 3.10 runtime is past end of support — dates, impact, migration"
description: "The App Engine standard environment runtime support schedule lists Python 3.10 (runtime ID python310) with end of support on 2026-10-04 and deprecation on 2027-10-01."
layout: doc
permalink: "/rules/serverless.google-appengine-runtime.python310.html"
canonical_url: "https://arminazimi.github.io/evergreen/rules/serverless.google-appengine-runtime.python310.html"
image: "/assets/og/serverless.google-appengine-runtime.python310.svg"
review_date: "2026-10-30"
last_modified_at: "2026-10-30"
json_twin: "/rules/serverless.google-appengine-runtime.python310.json"
---

# App Engine Python 3.10 runtime is past end of support

**End of support** as of 2026-10-04. Replacement: python311 or later. Source: [App Engine standard environment runtime support schedule](https://cloud.google.com/appengine/docs/standard/lifecycle/support-schedule).

Check a version:

```bash
evergreen check pkg:generic/google-appengine-runtime/python310
```

The App Engine standard environment runtime support schedule lists Python 3.10 (runtime ID python310) with end of support on 2026-10-04 and deprecation on 2027-10-01. Google no longer provides patches or support for that runtime.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `serverless` |
| Component | `pkg:generic/google-appengine-runtime/python310` |
| Affected versions | `vers:semver/*` |
| Date from the source | 2026-10-04 |
| Replacement | python311 or later |
| Evidence last seen | 2026-10-30 |
| Reviewed | 2026-10-30 by arminazimi |
| Review due | 2027-01-28 (90 days after the last review) |
| Rule ID | `serverless.google-appengine-runtime.python310` |

## Sources

- [App Engine standard environment runtime support schedule](https://cloud.google.com/appengine/docs/standard/lifecycle/support-schedule) (accessed 2026-10-30)

## Migration

**Constraints**

- Keep the App Engine service runtime on an ID Google still supports; the service must be redeployed as a new version to change it.
- Raising the runtime can require language and dependency changes; confirm the app runs on the replacement before shifting traffic.

**Steps**

1. **Raise the App Engine runtime.** Set the runtime to a supported runtime ID (see the replacement) in app.yaml and in the Terraform google_app_engine_standard_app_version.
2. **Deploy a new version.** Deploy the change as a new version and move traffic to it after it serves correctly.

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

This page is generated from [`registry/serverless.json`](https://github.com/arminazimi/evergreen/blob/main/registry/serverless.json), rule `serverless.google-appengine-runtime.python310`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/serverless.google-appengine-runtime.python310.html",
      "url": "https://arminazimi.github.io/evergreen/rules/serverless.google-appengine-runtime.python310.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/serverless.google-appengine-runtime.python310.html",
      "headline": "App Engine Python 3.10 runtime is past end of support — dates, impact, migration",
      "description": "The App Engine standard environment runtime support schedule lists Python 3.10 (runtime ID python310) with end of support on 2026-10-04 and deprecation on 2027-10-01.",
      "inLanguage": "en",
      "dateModified": "2026-10-30",
      "keywords": [
        "end-of-support",
        "serverless",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "App Engine Python 3.10 runtime is past end of support",
        "identifier": "pkg:generic/google-appengine-runtime/python310"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "App Engine standard environment runtime support schedule",
          "url": "https://cloud.google.com/appengine/docs/standard/lifecycle/support-schedule"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/serverless.google-appengine-runtime.python310.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/serverless.google-appengine-runtime.python310.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/google-appengine-runtime/python310?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of support as of 2026-10-04. Affected versions: vers:semver/*. Source: App Engine standard environment runtime support schedule (https://cloud.google.com/appengine/docs/standard/lifecycle/support-schedule)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/google-appengine-runtime/python310?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "python311 or later"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/google-appengine-runtime/python310?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/google-appengine-runtime/python310."
          }
        }
      ]
    }
  ]
}
</script>
