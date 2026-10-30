---
title: "Microsoft.Azure.DocumentDB is deprecated on NuGet — dates, impact, migration"
description: "NuGet marks all 36 listed versions of Microsoft.Azure.DocumentDB as deprecated (reason: Legacy)."
canonical_url: "https://arminazimi.github.io/evergreen/rules/dotnet.package.microsoft-azure-documentdb.deprecated.html"
json_twin: "/rules/dotnet.package.microsoft-azure-documentdb.deprecated.json"
---

# Microsoft.Azure.DocumentDB is deprecated on NuGet

**Deprecated** as of 2023-03-31. Replacement: Microsoft.Azure.Cosmos. Source: [Microsoft.Azure.DocumentDB on NuGet (deprecation metadata)](https://www.nuget.org/packages/Microsoft.Azure.DocumentDB).

Check a version:

```bash
evergreen check pkg:nuget/Microsoft.Azure.DocumentDB
```

NuGet marks all 36 listed versions of Microsoft.Azure.DocumentDB as deprecated (reason: Legacy). The publisher's message: "Please note, this package is obsolete as of 3/31/2023 and is no longer maintained or monitored. Microsoft encourages you to upgrade to the replacement package, Microsoft.Azure.Cosmos, to continue receiving updates. Refer to our deprecation policy (https://aka.ms/azsdk/support-policies) for more details."

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `dotnet` |
| Component | `pkg:nuget/Microsoft.Azure.DocumentDB` |
| Affected versions | `vers:nuget/*` |
| Date from the source | 2023-03-31 |
| Replacement | Microsoft.Azure.Cosmos |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi, drafted by the `dotnet-2` importer |
| Review due | 2027-01-17 (90 days after the last review) |
| Rule ID | `dotnet.package.microsoft-azure-documentdb.deprecated` |

## Sources

- [Microsoft.Azure.DocumentDB on NuGet (deprecation metadata)](https://www.nuget.org/packages/Microsoft.Azure.DocumentDB)
- [NuGet package deprecation](https://learn.microsoft.com/nuget/nuget-org/deprecate-packages)

## Migration

**Constraints**

- Keep the account, database, and container names and the stored documents the same; only the client library changes.
- The Cosmos DB v3 SDK names collections "containers" and replaces DocumentClient with CosmosClient; check queries and partition key handling after the move.

**Steps**

1. **Move to Microsoft.Azure.Cosmos.** Replace Microsoft.Azure.DocumentDB with Microsoft.Azure.Cosmos and update DocumentClient code to CosmosClient, Database, and Container.

**Verification**

- `dotnet build && dotnet test`: Build and test after the client library change.

## Detected by

The `dotnet` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/dotnet.json`](https://github.com/arminazimi/evergreen/blob/main/registry/dotnet.json), rule `dotnet.package.microsoft-azure-documentdb.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/dotnet.package.microsoft-azure-documentdb.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/dotnet.package.microsoft-azure-documentdb.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/dotnet.package.microsoft-azure-documentdb.deprecated.html",
  "headline": "Microsoft.Azure.DocumentDB is deprecated on NuGet — dates, impact, migration",
  "description": "NuGet marks all 36 listed versions of Microsoft.Azure.DocumentDB as deprecated (reason: Legacy).",
  "inLanguage": "en",
  "dateModified": "2026-10-19",
  "keywords": [
    "deprecated",
    "dotnet",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "Microsoft.Azure.DocumentDB is deprecated on NuGet",
    "identifier": "pkg:nuget/Microsoft.Azure.DocumentDB"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Microsoft.Azure.DocumentDB on NuGet (deprecation metadata)",
      "url": "https://www.nuget.org/packages/Microsoft.Azure.DocumentDB"
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
}
</script>
