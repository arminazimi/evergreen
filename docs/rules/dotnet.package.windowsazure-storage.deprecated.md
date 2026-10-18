---
title: "WindowsAzure.Storage is deprecated on NuGet — dates, impact, migration"
description: "Microsoft marked every version of WindowsAzure.Storage as deprecated (reason: Legacy) because the package has been obsolete since 2023-03-31 and is no longer maintained or monitored."
canonical_url: "https://arminazimi.github.io/evergreen/rules/dotnet.package.windowsazure-storage.deprecated.html"
---

# WindowsAzure.Storage is deprecated on NuGet

Microsoft marked every version of WindowsAzure.Storage as deprecated (reason: Legacy) because the package has been obsolete since 2023-03-31 and is no longer maintained or monitored. The deprecation names Azure.Storage.Common as the replacement.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `dotnet` |
| Component | `pkg:nuget/WindowsAzure.Storage` |
| Affected versions | `vers:nuget/*` |
| Date from the source | 2023-03-31 |
| Replacement | Azure.Storage.Blobs, Azure.Storage.Queues, Azure.Storage.Files.Shares, or Azure.Data.Tables, with Azure.Storage.Common |
| Evidence last seen | 2026-10-17 |
| Reviewed | 2026-10-17 by arminazimi |
| Review due | 2027-01-15 (90 days after the last review) |
| Rule ID | `dotnet.package.windowsazure-storage.deprecated` |

## Sources

- [WindowsAzure.Storage on NuGet (deprecation metadata)](https://www.nuget.org/packages/WindowsAzure.Storage)
- [NuGet package deprecation](https://learn.microsoft.com/nuget/nuget-org/deprecate-packages)
- [Azure SDK support policies](https://azure.github.io/azure-sdk/policies_support.html)

## Migration

**Constraints**

- Keep the data format and the blob, queue, and table names the same; only the client library changes.

**Steps**

1. **Move to the Azure.Storage.* packages.** Replace WindowsAzure.Storage with the package for each service in use (Azure.Storage.Blobs, Azure.Storage.Queues, Azure.Storage.Files.Shares, or Azure.Data.Tables) and update CloudStorageAccount and CloudBlobClient code to the new client types.

**Verification**

- `dotnet build && dotnet test`: Build and test after the client library change.

## Detected by

The `dotnet` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/dotnet.json`](https://github.com/arminazimi/evergreen/blob/main/registry/dotnet.json), rule `dotnet.package.windowsazure-storage.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/dotnet.package.windowsazure-storage.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/dotnet.package.windowsazure-storage.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/dotnet.package.windowsazure-storage.deprecated.html",
  "headline": "WindowsAzure.Storage is deprecated on NuGet — dates, impact, migration",
  "description": "Microsoft marked every version of WindowsAzure.Storage as deprecated (reason: Legacy) because the package has been obsolete since 2023-03-31 and is no longer maintained or monitored.",
  "inLanguage": "en",
  "dateModified": "2026-10-17",
  "keywords": [
    "deprecated",
    "dotnet",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "WindowsAzure.Storage is deprecated on NuGet",
    "identifier": "pkg:nuget/WindowsAzure.Storage"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "WindowsAzure.Storage on NuGet (deprecation metadata)",
      "url": "https://www.nuget.org/packages/WindowsAzure.Storage"
    },
    {
      "@type": "CreativeWork",
      "name": "NuGet package deprecation",
      "url": "https://learn.microsoft.com/nuget/nuget-org/deprecate-packages"
    },
    {
      "@type": "CreativeWork",
      "name": "Azure SDK support policies",
      "url": "https://azure.github.io/azure-sdk/policies_support.html"
    }
  ],
  "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/dotnet.json",
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen"
  }
}
</script>
