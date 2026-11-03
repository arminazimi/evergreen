---
title: "Azure Functions runtime 1.x is end-of-life — dates, impact, migration"
description: "Azure Functions supports only version 4.x of the runtime host and ended support for version 1.x on 2026-09-14."
layout: doc
permalink: "/rules/serverless.azure-functions.runtime-1-x.html"
canonical_url: "https://arminazimi.github.io/evergreen/rules/serverless.azure-functions.runtime-1-x.html"
image: "/assets/og/serverless.azure-functions.runtime-1-x.svg"
review_date: "2026-11-03"
last_modified_at: "2026-11-03"
json_twin: "/rules/serverless.azure-functions.runtime-1-x.json"
---

# Azure Functions runtime 1.x is end-of-life

**End of life** as of 2026-09-14. Replacement: Azure Functions 4.x. Source: [Compare Azure Functions runtime versions](https://learn.microsoft.com/en-us/azure/azure-functions/functions-versions).

Check a version:

```bash
evergreen check pkg:generic/azure-functions
```

Azure Functions supports only version 4.x of the runtime host and ended support for version 1.x on 2026-09-14. A FUNCTIONS_EXTENSION_VERSION of ~1 no longer receives security patches and the app is not eligible for Azure support.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `serverless` |
| Component | `pkg:generic/azure-functions` |
| Affected versions | `vers:semver/>=1.0.0\|<2.0.0` |
| Date from the source | 2026-09-14 |
| Replacement | Azure Functions 4.x |
| Evidence last seen | 2026-11-03 |
| Reviewed | 2026-11-03 by arminazimi |
| Review due | 2027-02-01 (90 days after the last review) |
| Rule ID | `serverless.azure-functions.runtime-1-x` |

## Sources

- [Compare Azure Functions runtime versions](https://learn.microsoft.com/en-us/azure/azure-functions/functions-versions) (accessed 2026-11-03)

## Migration

**Constraints**

- Azure Functions supports only version 4.x of the runtime host; a function app pinned to an earlier major version keeps running but is not eligible for new features, security patches, or service support.
- Raising FUNCTIONS_EXTENSION_VERSION alone is not enough: the app settings, bindings, and function code can need changes, so follow the published migration guide for the version being left.
- The runtime version is an app setting in Azure, and this rule fires only when the export writes the version into siteConfig.

**Steps**

1. **Migrate the function app to the v4 runtime.** Follow the Azure Functions migration guide for the version being left, then set FUNCTIONS_EXTENSION_VERSION to ~4 in the app's configuration.
2. **Align the runtime declaration.** Set the same version in the deployment source - the siteConfig.FUNCTIONS_EXTENSION_VERSION app setting in an Azure Resource Manager or Bicep template, the version in host.json or the .csproj AzureFunctionsVersion for a function project, and the azurerm_function_app version in Terraform.

**Verification**

- `az functionapp config appsettings list --resource-group <group> --name <app> --query "[?name=='FUNCTIONS_EXTENSION_VERSION'].value"`: Confirm the app targets the v4 runtime.
- `az functionapp deployment list-publishing-credentials --resource-group <group> --name <app>`: Confirm the app is still reachable and deploying after the migration.

## Detected by

The `serverless` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Other versions of this product

- [Azure Functions runtime 2.x and 3.x are out of support](serverless.azure-functions.runtime-2-x-and-3-x.html)

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

This page is generated from [`registry/serverless.json`](https://github.com/arminazimi/evergreen/blob/main/registry/serverless.json), rule `serverless.azure-functions.runtime-1-x`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/serverless.azure-functions.runtime-1-x.html",
      "url": "https://arminazimi.github.io/evergreen/rules/serverless.azure-functions.runtime-1-x.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/serverless.azure-functions.runtime-1-x.html",
      "headline": "Azure Functions runtime 1.x is end-of-life — dates, impact, migration",
      "description": "Azure Functions supports only version 4.x of the runtime host and ended support for version 1.x on 2026-09-14.",
      "inLanguage": "en",
      "dateModified": "2026-11-03",
      "keywords": [
        "end-of-life",
        "serverless",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "Azure Functions runtime 1.x is end-of-life",
        "identifier": "pkg:generic/azure-functions"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Compare Azure Functions runtime versions",
          "url": "https://learn.microsoft.com/en-us/azure/azure-functions/functions-versions"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/serverless.azure-functions.runtime-1-x.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/serverless.azure-functions.runtime-1-x.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/azure-functions?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life as of 2026-09-14. Affected versions: vers:semver/>=1.0.0|\u003c2.0.0. Source: Compare Azure Functions runtime versions (https://learn.microsoft.com/en-us/azure/azure-functions/functions-versions)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/azure-functions?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Azure Functions 4.x"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/azure-functions?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/azure-functions."
          }
        }
      ]
    }
  ]
}
</script>
