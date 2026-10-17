---
title: "WindowsAzure.Storage is deprecated on NuGet"
description: "Microsoft marked every version of WindowsAzure.Storage as deprecated (reason: Legacy) because the package has been obsolete since 2023-03-31 and is no longer maintained or monitored."
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

No built-in detector reads `dotnet` declarations yet; the rule is data in the [lifecycle registry](https://github.com/arminazimi/evergreen/blob/main/registry/dotnet.json).

## Data

This page is generated from [`registry/dotnet.json`](https://github.com/arminazimi/evergreen/blob/main/registry/dotnet.json), rule `dotnet.package.windowsazure-storage.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
