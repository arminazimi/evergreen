---
title: "App Service Node.js 18 stack is past end of support — dates, impact, migration"
description: "Azure App Service follows the community support timeline for each language stack: past the end-of-support date the app keeps running, but the platform stops providing security patches or related…"
layout: doc
permalink: "/rules/serverless.azure-app-service.node-18.html"
canonical_url: "https://arminazimi.github.io/evergreen/rules/serverless.azure-app-service.node-18.html"
image: "/assets/og/serverless.azure-app-service.node-18.svg"
review_date: "2026-11-03"
last_modified_at: "2026-11-03"
json_twin: "/rules/serverless.azure-app-service.node-18.json"
---

# App Service Node.js 18 stack is past end of support

**End of life** as of 2025-04-30. Replacement: App Service Node.js 20 or later. Source: [Language Runtime Support Policy - Azure App Service](https://learn.microsoft.com/en-us/azure/app-service/language-support-policy).

Check a version:

```bash
evergreen check pkg:generic/azure-app-service/node
```

Azure App Service follows the community support timeline for each language stack: past the end-of-support date the app keeps running, but the platform stops providing security patches or related support for that runtime version. The Node.js release schedule ended support for Node.js 18 on 2025-04-30, so a NODE|18 app no longer receives a patched runtime.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `serverless` |
| Component | `pkg:generic/azure-app-service/node` |
| Affected versions | `vers:semver/>=18.0.0\|<19.0.0` |
| Date from the source | 2025-04-30 |
| Replacement | App Service Node.js 20 or later |
| Evidence last seen | 2026-11-03 |
| Reviewed | 2026-11-03 by arminazimi |
| Review due | 2027-02-01 (90 days after the last review) |
| Rule ID | `serverless.azure-app-service.node-18` |

## Sources

- [Language Runtime Support Policy - Azure App Service](https://learn.microsoft.com/en-us/azure/app-service/language-support-policy) (accessed 2026-11-03)
- [Node.js End-of-life](https://nodejs.org/en/about/eol) (accessed 2026-11-03)

## Migration

**Constraints**

- App Service follows the community end-of-support date for each language stack and stops providing security patches and related support for that runtime version past the date.
- The platform controls the minor and patch version of a managed stack, so raising the stack version is the only way to get a patched runtime.
- The stack is declared in siteConfig.linuxFxVersion on Linux and siteConfig.windowsFxVersion on Windows; both are set with az webapp config set.

**Steps**

1. **Raise the App Service language stack.** Set node to a supported stack version (see the replacement) with az webapp config set --linux-fx-version or --windows-fx-version, then redeploy the app.
2. **Align the stack declaration.** Change the same stack in the deployment source too - the siteConfig resource in an Azure Resource Manager template, the azurerm_linux_web_app linux_fx_version or azurerm_windows_web_app windows_fx_version in Terraform, and the Bicep equivalent - so the next deployment does not reset node.

**Verification**

- `az webapp config show --resource-group <group> --name <app> --query linuxFxVersion`: Confirm the app reports the new stack version.
- `az webapp restart --resource-group <group> --name <app> && az webapp log tail --resource-group <group> --name <app>`: Restart the app and watch the startup log for runtime errors on the new stack.

## Detected by

The `serverless` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Other versions of this product

- [App Service Node.js 20 stack is past end of support](serverless.azure-app-service.node-20.html)
- [App Service Node.js 22 stack is scheduled to leave support](serverless.azure-app-service.node-22.html)
- [App Service Node.js stacks older than 18 are no longer supported](serverless.azure-app-service.node-below-18.html)

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

This page is generated from [`registry/serverless.json`](https://github.com/arminazimi/evergreen/blob/main/registry/serverless.json), rule `serverless.azure-app-service.node-18`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/serverless.azure-app-service.node-18.html",
      "url": "https://arminazimi.github.io/evergreen/rules/serverless.azure-app-service.node-18.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/serverless.azure-app-service.node-18.html",
      "headline": "App Service Node.js 18 stack is past end of support — dates, impact, migration",
      "description": "Azure App Service follows the community support timeline for each language stack: past the end-of-support date the app keeps running, but the platform stops providing security patches or related…",
      "inLanguage": "en",
      "dateModified": "2026-11-03",
      "keywords": [
        "end-of-life",
        "serverless",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "App Service Node.js 18 stack is past end of support",
        "identifier": "pkg:generic/azure-app-service/node"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Language Runtime Support Policy - Azure App Service",
          "url": "https://learn.microsoft.com/en-us/azure/app-service/language-support-policy"
        },
        {
          "@type": "CreativeWork",
          "name": "Node.js End-of-life",
          "url": "https://nodejs.org/en/about/eol"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/serverless.azure-app-service.node-18.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/serverless.azure-app-service.node-18.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/azure-app-service/node?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life as of 2025-04-30. Affected versions: vers:semver/>=18.0.0|\u003c19.0.0. Source: Language Runtime Support Policy - Azure App Service (https://learn.microsoft.com/en-us/azure/app-service/language-support-policy)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/azure-app-service/node?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "App Service Node.js 20 or later"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/azure-app-service/node?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/azure-app-service/node."
          }
        }
      ]
    }
  ]
}
</script>
