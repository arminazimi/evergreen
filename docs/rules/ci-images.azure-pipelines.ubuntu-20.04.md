---
title: "Azure Pipelines Ubuntu 20.04 hosted image is retired — dates, impact, migration"
description: "The Ubuntu 20.04 hosted image was fully removed on 2025-04-30, per the Azure DevOps blog deprecation plan. The Microsoft-hosted agents page lists that image as retired."
canonical_url: "https://arminazimi.github.io/evergreen/rules/ci-images.azure-pipelines.ubuntu-20.04.html"
image: "/assets/og/ci-images.azure-pipelines.ubuntu-20.04.svg"
json_twin: "/rules/ci-images.azure-pipelines.ubuntu-20.04.json"
---

# Azure Pipelines Ubuntu 20.04 hosted image is retired

**Removed** as of 2025-04-30. Replacement: ubuntu-22.04, ubuntu-24.04, or ubuntu-latest. Source: [Upcoming Updates for Azure Pipelines Agents Images](https://devblogs.microsoft.com/devops/upcoming-updates-for-azure-pipelines-agents-images/).

Check a version:

```bash
evergreen check pkg:generic/azure-pipelines/ubuntu-image
```

The Ubuntu 20.04 hosted image was fully removed on 2025-04-30, per the Azure DevOps blog deprecation plan. The Microsoft-hosted agents page lists that image as retired.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

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

- [Upcoming Updates for Azure Pipelines Agents Images](https://devblogs.microsoft.com/devops/upcoming-updates-for-azure-pipelines-agents-images/) (accessed 2026-10-21)
- [Microsoft-hosted agents for Azure Pipelines](https://learn.microsoft.com/azure/devops/pipelines/agents/hosted) (accessed 2026-10-21)

## Migration

**Constraints**

- Change only Microsoft-hosted pool.vmImage labels. This removal does not apply to self-hosted Ubuntu 20.04 agents.
- The Ubuntu 20.04 notice names ubuntu-22.04, ubuntu-24.04, or ubuntu-latest. ubuntu-22.04 is scheduled for removal on 2027-04-17, so prefer ubuntu-24.04 or ubuntu-latest when the workload allows it.

**Steps**

1. **Retarget the hosted image.** Change the reported pool.vmImage from ubuntu-20.04 to ubuntu-24.04 or ubuntu-latest (the notice also allows ubuntu-22.04; see the replacement).
2. **Align other Azure Pipelines pools.** Update every other azure-pipelines.yml pool, including stage and job pools, that still pins ubuntu-20.04. Leave self-hosted pool names unchanged.

**Verification**

- `gitlab-ci-lint || circleci config validate`: Lint .gitlab-ci.yml with gitlab-ci-lint, or .circleci/config.yml with circleci config validate, when the repository has that file. Azure Pipelines has no equivalent local validator: queue the pipeline and confirm the job uses the replacement vmImage.

## Detected by

The `ci-images` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/ci-images.json`](https://github.com/arminazimi/evergreen/blob/main/registry/ci-images.json), rule `ci-images.azure-pipelines.ubuntu-20.04`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
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
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/ci-images.azure-pipelines.ubuntu-20.04.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/ci-images.azure-pipelines.ubuntu-20.04.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/azure-pipelines/ubuntu-image?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Removed as of 2025-04-30. Affected versions: vers:intdot/20.04. Source: Upcoming Updates for Azure Pipelines Agents Images (https://devblogs.microsoft.com/devops/upcoming-updates-for-azure-pipelines-agents-images/)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/azure-pipelines/ubuntu-image?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "ubuntu-22.04, ubuntu-24.04, or ubuntu-latest"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/azure-pipelines/ubuntu-image?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/azure-pipelines/ubuntu-image."
          }
        }
      ]
    }
  ]
}
</script>
