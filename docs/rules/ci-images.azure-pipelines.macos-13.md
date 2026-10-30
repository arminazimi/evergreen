---
title: "Azure Pipelines macOS 13 Ventura hosted image is retired — dates, impact, migration"
description: "The macOS 13 Ventura hosted image was retired on 2025-12-04. The Microsoft-hosted agents page states that date, and the Azure DevOps blog lists the same full retiral date."
canonical_url: "https://arminazimi.github.io/evergreen/rules/ci-images.azure-pipelines.macos-13.html"
json_twin: "/rules/ci-images.azure-pipelines.macos-13.json"
---

# Azure Pipelines macOS 13 Ventura hosted image is retired

The macOS 13 Ventura hosted image was retired on 2025-12-04. The Microsoft-hosted agents page states that date, and the Azure DevOps blog lists the same full retiral date.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

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

- [Microsoft-hosted agents for Azure Pipelines](https://learn.microsoft.com/azure/devops/pipelines/agents/hosted) (accessed 2026-10-21)
- [Upcoming Updates for Azure Pipelines Agents Images](https://devblogs.microsoft.com/devops/upcoming-updates-for-azure-pipelines-agents-images/) (accessed 2026-10-21)

## Migration

**Constraints**

- Change only Microsoft-hosted pool.vmImage labels. This retirement does not apply to self-hosted agents, Managed DevOps Pools, or VM scale sets.
- The macOS 13 notice names macos-14, macos-15, or macos-latest. macos-14 has its own scheduled removal on 2026-11-02, so prefer macos-15 or macos-latest when the workload allows it.

**Steps**

1. **Retarget the hosted image.** Change the reported pool.vmImage from macos-13 to macos-15 or macos-latest (the notice also allows macos-14; see the replacement).
2. **Align other Azure Pipelines pools.** Update every other azure-pipelines.yml pool, including stage and job pools, that still pins macos-13. Leave self-hosted pool names unchanged.

**Verification**

- `gitlab-ci-lint || circleci config validate`: Lint .gitlab-ci.yml with gitlab-ci-lint, or .circleci/config.yml with circleci config validate, when the repository has that file. Azure Pipelines has no equivalent local validator: queue the pipeline and confirm the job uses the replacement vmImage.

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
