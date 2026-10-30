---
title: "Microsoft.Azure.ServiceBus is deprecated on NuGet — dates, impact, migration"
description: "NuGet marks all 33 listed versions of Microsoft.Azure.ServiceBus as deprecated (reason: Legacy)."
canonical_url: "https://arminazimi.github.io/evergreen/rules/dotnet.package.microsoft-azure-servicebus.deprecated.html"
---

# Microsoft.Azure.ServiceBus is deprecated on NuGet

**Deprecated** as of 2026-09-30. Replacement: Azure.Messaging.ServiceBus. Source: [Microsoft.Azure.ServiceBus on NuGet (deprecation metadata)](https://www.nuget.org/packages/Microsoft.Azure.ServiceBus).

Check a version:

```bash
evergreen check pkg:nuget/Microsoft.Azure.ServiceBus
```

NuGet marks all 33 listed versions of Microsoft.Azure.ServiceBus as deprecated (reason: Legacy). The publisher's message: "Please note, this package is obsolete as of 9/30/2026 and is no longer maintained or monitored. Microsoft encourages you to upgrade to the replacement package, Azure.Messaging.ServiceBus, to continue receiving updates. Refer to the migration guide (https://aka.ms/azsdk/net/migrate/sb) for guidance on upgrading. Refer to our deprecation policy (https://aka.ms/azsdk/support-policies) for more details."

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `dotnet` |
| Component | `pkg:nuget/Microsoft.Azure.ServiceBus` |
| Affected versions | `vers:nuget/*` |
| Date from the source | 2026-09-30 |
| Replacement | Azure.Messaging.ServiceBus |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi, drafted by the `dotnet-2` importer |
| Review due | 2027-01-17 (90 days after the last review) |
| Rule ID | `dotnet.package.microsoft-azure-servicebus.deprecated` |

## Sources

- [Microsoft.Azure.ServiceBus on NuGet (deprecation metadata)](https://www.nuget.org/packages/Microsoft.Azure.ServiceBus)
- [NuGet package deprecation](https://learn.microsoft.com/nuget/nuget-org/deprecate-packages)

## Migration

**Constraints**

- Keep the namespace, queue, topic, and subscription names the same; only the client library changes.
- Read the migration guide first: message settlement, sessions, and retry options moved to ServiceBusClient, ServiceBusSender, ServiceBusReceiver, and ServiceBusProcessor.

**Steps**

1. **Move to Azure.Messaging.ServiceBus.** Replace Microsoft.Azure.ServiceBus with Azure.Messaging.ServiceBus and update QueueClient, TopicClient, and SubscriptionClient code to ServiceBusClient with senders, receivers, or processors.

**Verification**

- `dotnet build && dotnet test`: Build and test after the client library change.

## Detected by

The `dotnet` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/dotnet.json`](https://github.com/arminazimi/evergreen/blob/main/registry/dotnet.json), rule `dotnet.package.microsoft-azure-servicebus.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/dotnet.package.microsoft-azure-servicebus.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/dotnet.package.microsoft-azure-servicebus.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/dotnet.package.microsoft-azure-servicebus.deprecated.html",
  "headline": "Microsoft.Azure.ServiceBus is deprecated on NuGet — dates, impact, migration",
  "description": "NuGet marks all 33 listed versions of Microsoft.Azure.ServiceBus as deprecated (reason: Legacy).",
  "inLanguage": "en",
  "dateModified": "2026-10-19",
  "keywords": [
    "deprecated",
    "dotnet",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "Microsoft.Azure.ServiceBus is deprecated on NuGet",
    "identifier": "pkg:nuget/Microsoft.Azure.ServiceBus"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Microsoft.Azure.ServiceBus on NuGet (deprecation metadata)",
      "url": "https://www.nuget.org/packages/Microsoft.Azure.ServiceBus"
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
