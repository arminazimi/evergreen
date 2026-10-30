---
title: "Microsoft.Azure.Storage.Blob is deprecated on NuGet — dates, impact, migration"
description: "NuGet marks all 24 listed versions of Microsoft.Azure.Storage.Blob as deprecated (reason: Legacy)."
canonical_url: "https://arminazimi.github.io/evergreen/rules/dotnet.package.microsoft-azure-storage-blob.deprecated.html"
json_twin: "/rules/dotnet.package.microsoft-azure-storage-blob.deprecated.json"
---

# Microsoft.Azure.Storage.Blob is deprecated on NuGet

**Deprecated** as of 2023-03-31. Replacement: Azure.Storage.Blobs. Source: [Microsoft.Azure.Storage.Blob on NuGet (deprecation metadata)](https://www.nuget.org/packages/Microsoft.Azure.Storage.Blob).

Check a version:

```bash
evergreen check pkg:nuget/Microsoft.Azure.Storage.Blob
```

NuGet marks all 24 listed versions of Microsoft.Azure.Storage.Blob as deprecated (reason: Legacy). The publisher's message: "Please note, this package is obsolete as of 3/31/2023 and is no longer maintained or monitored. Microsoft encourages you to upgrade to the replacement package, Azure.Storage.Blobs, to continue receiving updates. Refer to the migration guide (https://github.com/Azure/azure-sdk-for-net/blob/master/sdk/storage/Azure.Storage.Blobs/AzureStorageNetMigrationV12.md) for guidance on upgrading. Refer to our deprecation policy (https://aka.ms/azsdk/support-policies) for more details."

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `dotnet` |
| Component | `pkg:nuget/Microsoft.Azure.Storage.Blob` |
| Affected versions | `vers:nuget/*` |
| Date from the source | 2023-03-31 |
| Replacement | Azure.Storage.Blobs |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi, drafted by the `dotnet-2` importer |
| Review due | 2027-01-17 (90 days after the last review) |
| Rule ID | `dotnet.package.microsoft-azure-storage-blob.deprecated` |

## Sources

- [Microsoft.Azure.Storage.Blob on NuGet (deprecation metadata)](https://www.nuget.org/packages/Microsoft.Azure.Storage.Blob)
- [NuGet package deprecation](https://learn.microsoft.com/nuget/nuget-org/deprecate-packages)

## Migration

**Constraints**

- Keep the container and blob names and the stored data the same; only the client library changes.
- Read the v12 migration guide: CloudStorageAccount and CloudBlobClient become BlobServiceClient, and blob handles become BlobClient types.

**Steps**

1. **Move to Azure.Storage.Blobs.** Replace Microsoft.Azure.Storage.Blob with Azure.Storage.Blobs and update CloudStorageAccount, CloudBlobClient, CloudBlobContainer, and CloudBlockBlob code to BlobServiceClient, BlobContainerClient, and BlobClient.

**Verification**

- `dotnet build && dotnet test`: Build and test after the client library change.

## Detected by

The `dotnet` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/dotnet.json`](https://github.com/arminazimi/evergreen/blob/main/registry/dotnet.json), rule `dotnet.package.microsoft-azure-storage-blob.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/dotnet.package.microsoft-azure-storage-blob.deprecated.html",
      "url": "https://arminazimi.github.io/evergreen/rules/dotnet.package.microsoft-azure-storage-blob.deprecated.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/dotnet.package.microsoft-azure-storage-blob.deprecated.html",
      "headline": "Microsoft.Azure.Storage.Blob is deprecated on NuGet — dates, impact, migration",
      "description": "NuGet marks all 24 listed versions of Microsoft.Azure.Storage.Blob as deprecated (reason: Legacy).",
      "inLanguage": "en",
      "dateModified": "2026-10-19",
      "keywords": [
        "deprecated",
        "dotnet",
        "medium"
      ],
      "about": {
        "@type": "Thing",
        "name": "Microsoft.Azure.Storage.Blob is deprecated on NuGet",
        "identifier": "pkg:nuget/Microsoft.Azure.Storage.Blob"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Microsoft.Azure.Storage.Blob on NuGet (deprecation metadata)",
          "url": "https://www.nuget.org/packages/Microsoft.Azure.Storage.Blob"
        },
        {
          "@type": "CreativeWork",
          "name": "NuGet package deprecation",
          "url": "https://learn.microsoft.com/nuget/nuget-org/deprecate-packages"
        }
      ],
      "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/dotnet.json",
      "publisher": {
        "@type": "Organization",
        "name": "Evergreen",
        "url": "https://arminazimi.github.io/evergreen"
      }
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/dotnet.package.microsoft-azure-storage-blob.deprecated.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/dotnet.package.microsoft-azure-storage-blob.deprecated.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:nuget/Microsoft.Azure.Storage.Blob?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated as of 2023-03-31. Affected versions: vers:nuget/*. Source: Microsoft.Azure.Storage.Blob on NuGet (deprecation metadata) (https://www.nuget.org/packages/Microsoft.Azure.Storage.Blob)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:nuget/Microsoft.Azure.Storage.Blob?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Azure.Storage.Blobs"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:nuget/Microsoft.Azure.Storage.Blob?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:nuget/Microsoft.Azure.Storage.Blob."
          }
        }
      ]
    }
  ]
}
</script>
