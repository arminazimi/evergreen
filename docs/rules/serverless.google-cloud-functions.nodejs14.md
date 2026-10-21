---
title: "Google Cloud Functions Node.js 14 runtime is end-of-life — dates, impact, migration"
description: "The Google Cloud Functions runtime support schedule lists Node.js 14 (runtime ID nodejs14) as deprecated on 2024-01-30 and decommissioned on 2025-01-30."
canonical_url: "https://arminazimi.github.io/evergreen/rules/serverless.google-cloud-functions.nodejs14.html"
---

# Google Cloud Functions Node.js 14 runtime is end-of-life

The Google Cloud Functions runtime support schedule lists Node.js 14 (runtime ID nodejs14) as deprecated on 2024-01-30 and decommissioned on 2025-01-30. Google no longer provides maintenance for that runtime.

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

- [Cloud Run functions runtime support](https://cloud.google.com/functions/docs/runtime-support)

## Detected by

No built-in detector reads `serverless` declarations yet; the rule is data in the [lifecycle registry](https://github.com/arminazimi/evergreen/blob/main/registry/serverless.json).

## Data

This page is generated from [`registry/serverless.json`](https://github.com/arminazimi/evergreen/blob/main/registry/serverless.json), rule `serverless.google-cloud-functions.nodejs14`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
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
}
</script>
