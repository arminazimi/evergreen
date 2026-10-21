---
title: "Azure Pipelines Windows Server 2019 hosted image is retired — dates, impact, migration"
description: "The Windows Server 2019 hosted image was retired on 2025-12-31. The Azure DevOps blog sets that full removal date, and the Microsoft-hosted agents page records the same retirement."
canonical_url: "https://arminazimi.github.io/evergreen/rules/ci-images.azure-pipelines.windows-2019.html"
---

# Azure Pipelines Windows Server 2019 hosted image is retired

The Windows Server 2019 hosted image was retired on 2025-12-31. The Azure DevOps blog sets that full removal date, and the Microsoft-hosted agents page records the same retirement.

| | |
| --- | --- |
| Status | Removed |
| Severity | high |
| Ecosystem | `ci-images` |
| Component | `pkg:generic/azure-pipelines/windows-image` |
| Affected versions | `vers:intdot/2019` |
| Date from the source | 2025-12-31 |
| Replacement | windows-2022, windows-2025, or windows-latest |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-10-21 (365 days after the last review) |
| Rule ID | `ci-images.azure-pipelines.windows-2019` |

## Sources

- [Upcoming Updates for Azure Pipelines Agents Images](https://devblogs.microsoft.com/devops/upcoming-updates-for-azure-pipelines-agents-images/)
- [Microsoft-hosted agents for Azure Pipelines](https://learn.microsoft.com/azure/devops/pipelines/agents/hosted)

## Detected by

The `ci-images` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/ci-images.json`](https://github.com/arminazimi/evergreen/blob/main/registry/ci-images.json), rule `ci-images.azure-pipelines.windows-2019`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/ci-images.azure-pipelines.windows-2019.html",
  "url": "https://arminazimi.github.io/evergreen/rules/ci-images.azure-pipelines.windows-2019.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/ci-images.azure-pipelines.windows-2019.html",
  "headline": "Azure Pipelines Windows Server 2019 hosted image is retired — dates, impact, migration",
  "description": "The Windows Server 2019 hosted image was retired on 2025-12-31. The Azure DevOps blog sets that full removal date, and the Microsoft-hosted agents page records the same retirement.",
  "inLanguage": "en",
  "dateModified": "2026-10-21",
  "keywords": [
    "removed",
    "ci-images",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Azure Pipelines Windows Server 2019 hosted image is retired",
    "identifier": "pkg:generic/azure-pipelines/windows-image"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Upcoming Updates for Azure Pipelines Agents Images",
      "url": "https://devblogs.microsoft.com/devops/upcoming-updates-for-azure-pipelines-agents-images/"
    },
    {
      "@type": "CreativeWork",
      "name": "Microsoft-hosted agents for Azure Pipelines",
      "url": "https://learn.microsoft.com/azure/devops/pipelines/agents/hosted"
    }
  ],
  "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/ci-images.json",
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen"
  }
}
</script>
