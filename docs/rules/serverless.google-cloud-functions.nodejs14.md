---
title: "Google Cloud Functions Node.js 14 runtime is end-of-life — dates, impact, migration"
description: "The Google Cloud Functions runtime support schedule lists Node.js 14 (runtime ID nodejs14) as deprecated on 2024-01-30 and decommissioned on 2025-01-30."
canonical_url: "https://arminazimi.github.io/evergreen/rules/serverless.google-cloud-functions.nodejs14.html"
json_twin: "/rules/serverless.google-cloud-functions.nodejs14.json"
---

# Google Cloud Functions Node.js 14 runtime is end-of-life

**End of life** as of 2025-01-30. Replacement: nodejs22 or nodejs24. Source: [Cloud Run functions runtime support](https://cloud.google.com/functions/docs/runtime-support).

Check a version:

```bash
evergreen check pkg:generic/google-cloud-functions-runtime/nodejs14
```

The Google Cloud Functions runtime support schedule lists Node.js 14 (runtime ID nodejs14) as deprecated on 2024-01-30 and decommissioned on 2025-01-30. Google no longer provides maintenance for that runtime.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `serverless` |
| Component | `pkg:generic/google-cloud-functions-runtime/nodejs14` |
| Affected versions | `vers:semver/*` |
| Date from the source | 2025-01-30 |
| Replacement | nodejs22 or nodejs24 |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-01-19 (90 days after the last review) |
| Rule ID | `serverless.google-cloud-functions.nodejs14` |

## Sources

- [Cloud Run functions runtime support](https://cloud.google.com/functions/docs/runtime-support) (accessed 2026-10-21)

## Migration

**Constraints**

- Keep Terraform google_cloudfunctions*_function runtime (and any matching deploy config) on one Google Cloud Functions runtime ID that Google still supports.
- Raising the managed runtime can require Node.js language and dependency changes; confirm handlers run on the replacement before deploying.

**Steps**

1. **Raise the Google Cloud Functions runtime.** Change the reported runtime from nodejs14 to a supported Google Cloud Functions Node.js runtime ID (see the replacement).
2. **Align other runtime surfaces.** Update every other Terraform google_cloudfunctions*_function runtime and CI deploy config that still pins nodejs14.

**Verification**

- `terraform validate`: Validate the updated Terraform google_cloudfunctions*_function declaration before deploy.

## Detected by

The `serverless` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/serverless.json`](https://github.com/arminazimi/evergreen/blob/main/registry/serverless.json), rule `serverless.google-cloud-functions.nodejs14`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/serverless.google-cloud-functions.nodejs14.html",
      "url": "https://arminazimi.github.io/evergreen/rules/serverless.google-cloud-functions.nodejs14.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/serverless.google-cloud-functions.nodejs14.html",
      "headline": "Google Cloud Functions Node.js 14 runtime is end-of-life — dates, impact, migration",
      "description": "The Google Cloud Functions runtime support schedule lists Node.js 14 (runtime ID nodejs14) as deprecated on 2024-01-30 and decommissioned on 2025-01-30.",
      "inLanguage": "en",
      "dateModified": "2026-10-21",
      "keywords": [
        "end-of-life",
        "serverless",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "Google Cloud Functions Node.js 14 runtime is end-of-life",
        "identifier": "pkg:generic/google-cloud-functions-runtime/nodejs14"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/serverless.google-cloud-functions.nodejs14.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/serverless.google-cloud-functions.nodejs14.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/google-cloud-functions-runtime/nodejs14?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life as of 2025-01-30. Affected versions: vers:semver/*. Source: Cloud Run functions runtime support (https://cloud.google.com/functions/docs/runtime-support)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/google-cloud-functions-runtime/nodejs14?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "nodejs22 or nodejs24"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/google-cloud-functions-runtime/nodejs14?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/google-cloud-functions-runtime/nodejs14."
          }
        }
      ]
    }
  ]
}
</script>
