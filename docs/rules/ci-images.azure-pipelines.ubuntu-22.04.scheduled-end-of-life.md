---
title: "Azure Pipelines Ubuntu 22.04 hosted image is scheduled for removal — dates, impact, migration"
description: "The Ubuntu 22.04 hosted image deprecation starts on 2026-09-17 and its scheduled removal is 2027-04-17, per Microsoft's hosted image deprecation schedule."
canonical_url: "https://arminazimi.github.io/evergreen/rules/ci-images.azure-pipelines.ubuntu-22.04.scheduled-end-of-life.html"
---

# Azure Pipelines Ubuntu 22.04 hosted image is scheduled for removal

The Ubuntu 22.04 hosted image deprecation starts on 2026-09-17 and its scheduled removal is 2027-04-17, per Microsoft's hosted image deprecation schedule.

| | |
| --- | --- |
| Status | Scheduled end of life |
| Severity | low |
| Ecosystem | `ci-images` |
| Component | `pkg:generic/azure-pipelines/ubuntu-image` |
| Affected versions | `vers:intdot/22.04` |
| Date from the source | 2027-04-17 |
| Replacement | ubuntu-latest, ubuntu-24.04, or ubuntu-26.04 |
| Evidence last seen | 2026-10-18 |
| Reviewed | 2026-10-18 by arminazimi |
| Review due | 2027-10-18 (365 days after the last review) |
| Rule ID | `ci-images.azure-pipelines.ubuntu-22.04.scheduled-end-of-life` |

## Sources

- [Microsoft-hosted image deprecation schedule](https://learn.microsoft.com/azure/devops/pipelines/agents/hosted-deprecation-schedule)

## Detected by

No built-in detector reads `ci-images` declarations yet; the rule is data in the [lifecycle registry](https://github.com/arminazimi/evergreen/blob/main/registry/ci-images.json).

## Data

This page is generated from [`registry/ci-images.json`](https://github.com/arminazimi/evergreen/blob/main/registry/ci-images.json), rule `ci-images.azure-pipelines.ubuntu-22.04.scheduled-end-of-life`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/ci-images.azure-pipelines.ubuntu-22.04.scheduled-end-of-life.html",
  "url": "https://arminazimi.github.io/evergreen/rules/ci-images.azure-pipelines.ubuntu-22.04.scheduled-end-of-life.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/ci-images.azure-pipelines.ubuntu-22.04.scheduled-end-of-life.html",
  "headline": "Azure Pipelines Ubuntu 22.04 hosted image is scheduled for removal — dates, impact, migration",
  "description": "The Ubuntu 22.04 hosted image deprecation starts on 2026-09-17 and its scheduled removal is 2027-04-17, per Microsoft's hosted image deprecation schedule.",
  "inLanguage": "en",
  "dateModified": "2026-10-18",
  "keywords": [
    "scheduled-end-of-life",
    "ci-images",
    "low"
  ],
  "about": {
    "@type": "Thing",
    "name": "Azure Pipelines Ubuntu 22.04 hosted image is scheduled for removal",
    "identifier": "pkg:generic/azure-pipelines/ubuntu-image"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Microsoft-hosted image deprecation schedule",
      "url": "https://learn.microsoft.com/azure/devops/pipelines/agents/hosted-deprecation-schedule"
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
