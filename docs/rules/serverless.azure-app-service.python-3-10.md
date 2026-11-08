---
title: "App Service Python 3.10 stack is past end of life — dates, impact, migration"
description: "Azure App Service follows the community support timeline for each language stack: past the end-of-support date the app keeps running, but the platform stops providing security patches or related…"
layout: doc
permalink: "/rules/serverless.azure-app-service.python-3-10.html"
canonical_url: "https://arminazimi.github.io/evergreen/rules/serverless.azure-app-service.python-3-10.html"
image: "/assets/og/serverless.azure-app-service.python-3-10.svg"
review_date: "2026-11-03"
last_modified_at: "2026-11-03"
json_twin: "/rules/serverless.azure-app-service.python-3-10.json"
---

# App Service Python 3.10 stack is past end of life

**End of life** as of 2026-10-01. Replacement: App Service Python 3.11 or later. Source: [Language Runtime Support Policy - Azure App Service](https://learn.microsoft.com/en-us/azure/app-service/language-support-policy).

Check a version:

```bash
evergreen check pkg:generic/azure-app-service/python
```

Azure App Service follows the community support timeline for each language stack: past the end-of-support date the app keeps running, but the platform stops providing security patches or related support for that runtime version. The Python release cycle ended support for Python 3.10 on 2026-10-01, so a PYTHON|3.10 app no longer receives a patched runtime.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `serverless` |
| Component | `pkg:generic/azure-app-service/python` |
| Affected versions | `vers:semver/>=3.10.0\|<3.11.0` |
| Date from the source | 2026-10-01 |
| Replacement | App Service Python 3.11 or later |
| Evidence last seen | 2026-11-03 |
| Reviewed | 2026-11-03 by arminazimi |
| Review due | 2027-02-01 (90 days after the last review) |
| Rule ID | `serverless.azure-app-service.python-3-10` |

## Sources

- [Language Runtime Support Policy - Azure App Service](https://learn.microsoft.com/en-us/azure/app-service/language-support-policy) (accessed 2026-11-03)
- [Status of Python versions](https://devguide.python.org/versions/) (accessed 2026-11-03)

## Migration

**Constraints**

- App Service follows the community end-of-support date for each language stack and stops providing security patches and related support for that runtime version past the date.
- The platform controls the minor and patch version of a managed stack, so raising the stack version is the only way to get a patched runtime.
- The stack is declared in siteConfig.linuxFxVersion on Linux and siteConfig.windowsFxVersion on Windows; both are set with az webapp config set.

**Steps**

1. **Raise the App Service language stack.** Set python to a supported stack version (see the replacement) with az webapp config set --linux-fx-version or --windows-fx-version, then redeploy the app.
2. **Align the stack declaration.** Change the same stack in the deployment source too - the siteConfig resource in an Azure Resource Manager template, the azurerm_linux_web_app linux_fx_version or azurerm_windows_web_app windows_fx_version in Terraform, and the Bicep equivalent - so the next deployment does not reset python.

**Verification**

- `az webapp config show --resource-group <group> --name <app> --query linuxFxVersion`: Confirm the app reports the new stack version.
- `az webapp restart --resource-group <group> --name <app> && az webapp log tail --resource-group <group> --name <app>`: Restart the app and watch the startup log for runtime errors on the new stack.

## Detected by

The `serverless` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Other versions of this product

- [App Service Python stacks older than 3.10 are past end of life](serverless.azure-app-service.python-below-3-10.html)

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

This page is generated from [`registry/serverless.json`](https://github.com/arminazimi/evergreen/blob/main/registry/serverless.json), rule `serverless.azure-app-service.python-3-10`, in the `ebb.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/serverless.azure-app-service.python-3-10.html",
      "url": "https://arminazimi.github.io/evergreen/rules/serverless.azure-app-service.python-3-10.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/serverless.azure-app-service.python-3-10.html",
      "headline": "App Service Python 3.10 stack is past end of life — dates, impact, migration",
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
        "name": "App Service Python 3.10 stack is past end of life",
        "identifier": "pkg:generic/azure-app-service/python"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Language Runtime Support Policy - Azure App Service",
          "url": "https://learn.microsoft.com/en-us/azure/app-service/language-support-policy"
        },
        {
          "@type": "CreativeWork",
          "name": "Status of Python versions",
          "url": "https://devguide.python.org/versions/"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/serverless.azure-app-service.python-3-10.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/serverless.azure-app-service.python-3-10.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/azure-app-service/python?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life as of 2026-10-01. Affected versions: vers:semver/>=3.10.0|\u003c3.11.0. Source: Language Runtime Support Policy - Azure App Service (https://learn.microsoft.com/en-us/azure/app-service/language-support-policy)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/azure-app-service/python?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "App Service Python 3.11 or later"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/azure-app-service/python?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/azure-app-service/python."
          }
        }
      ]
    }
  ]
}
</script>
