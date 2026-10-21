---
title: "Azure Pipelines Ubuntu 20.04 hosted image is retired — dates, impact, migration"
description: "The Ubuntu 20.04 hosted image was fully removed on 2025-04-30, per the Azure DevOps blog deprecation plan. The Microsoft-hosted agents page lists that image as retired."
canonical_url: "https://arminazimi.github.io/evergreen/rules/ci-images.azure-pipelines.ubuntu-20.04.html"
---

# Azure Pipelines Ubuntu 20.04 hosted image is retired

The Ubuntu 20.04 hosted image was fully removed on 2025-04-30, per the Azure DevOps blog deprecation plan. The Microsoft-hosted agents page lists that image as retired.

| | |
| --- | --- |
| Status | Removed |
| Severity | high |
| Ecosystem | `ci-images` |
| Component | `pkg:generic/azure-pipelines/ubuntu-image` |
| Affected versions | `vers:intdot/20.04` |
| Date from the source | 2025-04-30 |
| Replacement | ubuntu-22.04, ubuntu-24.04, or ubuntu-latest |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-10-21 (365 days after the last review) |
| Rule ID | `ci-images.azure-pipelines.ubuntu-20.04` |

## Sources

- [Upcoming Updates for Azure Pipelines Agents Images](https://devblogs.microsoft.com/devops/upcoming-updates-for-azure-pipelines-agents-images/)
- [Microsoft-hosted agents for Azure Pipelines](https://learn.microsoft.com/azure/devops/pipelines/agents/hosted)

## Detected by

The `ci-images` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/ci-images.json`](https://github.com/arminazimi/evergreen/blob/main/registry/ci-images.json), rule `ci-images.azure-pipelines.ubuntu-20.04`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/ci-images.azure-pipelines.ubuntu-20.04.html",
  "url": "https://arminazimi.github.io/evergreen/rules/ci-images.azure-pipelines.ubuntu-20.04.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/ci-images.azure-pipelines.ubuntu-20.04.html",
  "headline": "Azure Pipelines Ubuntu 20.04 hosted image is retired — dates, impact, migration",
  "description": "The Ubuntu 20.04 hosted image was fully removed on 2025-04-30, per the Azure DevOps blog deprecation plan. The Microsoft-hosted agents page lists that image as retired.",
  "inLanguage": "en",
  "dateModified": "2026-10-21",
  "keywords": [
    "removed",
    "ci-images",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Azure Pipelines Ubuntu 20.04 hosted image is retired",
    "identifier": "pkg:generic/azure-pipelines/ubuntu-image"
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
