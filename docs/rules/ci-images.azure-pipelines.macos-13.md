---
title: "Azure Pipelines macOS 13 Ventura hosted image is retired — dates, impact, migration"
description: "The macOS 13 Ventura hosted image was retired on 2025-12-04. The Microsoft-hosted agents page states that date, and the Azure DevOps blog lists the same full retiral date."
canonical_url: "https://arminazimi.github.io/evergreen/rules/ci-images.azure-pipelines.macos-13.html"
---

# Azure Pipelines macOS 13 Ventura hosted image is retired

The macOS 13 Ventura hosted image was retired on 2025-12-04. The Microsoft-hosted agents page states that date, and the Azure DevOps blog lists the same full retiral date.

| | |
| --- | --- |
| Status | Removed |
| Severity | high |
| Ecosystem | `ci-images` |
| Component | `pkg:generic/azure-pipelines/macos-image` |
| Affected versions | `vers:intdot/13` |
| Date from the source | 2025-12-04 |
| Replacement | macos-14, macos-15, or macos-latest |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-10-21 (365 days after the last review) |
| Rule ID | `ci-images.azure-pipelines.macos-13` |

## Sources

- [Microsoft-hosted agents for Azure Pipelines](https://learn.microsoft.com/azure/devops/pipelines/agents/hosted)
- [Upcoming Updates for Azure Pipelines Agents Images](https://devblogs.microsoft.com/devops/upcoming-updates-for-azure-pipelines-agents-images/)

## Detected by

The `ci-images` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/ci-images.json`](https://github.com/arminazimi/evergreen/blob/main/registry/ci-images.json), rule `ci-images.azure-pipelines.macos-13`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/ci-images.azure-pipelines.macos-13.html",
  "url": "https://arminazimi.github.io/evergreen/rules/ci-images.azure-pipelines.macos-13.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/ci-images.azure-pipelines.macos-13.html",
  "headline": "Azure Pipelines macOS 13 Ventura hosted image is retired — dates, impact, migration",
  "description": "The macOS 13 Ventura hosted image was retired on 2025-12-04. The Microsoft-hosted agents page states that date, and the Azure DevOps blog lists the same full retiral date.",
  "inLanguage": "en",
  "dateModified": "2026-10-21",
  "keywords": [
    "removed",
    "ci-images",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Azure Pipelines macOS 13 Ventura hosted image is retired",
    "identifier": "pkg:generic/azure-pipelines/macos-image"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Microsoft-hosted agents for Azure Pipelines",
      "url": "https://learn.microsoft.com/azure/devops/pipelines/agents/hosted"
    },
    {
      "@type": "CreativeWork",
      "name": "Upcoming Updates for Azure Pipelines Agents Images",
      "url": "https://devblogs.microsoft.com/devops/upcoming-updates-for-azure-pipelines-agents-images/"
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
