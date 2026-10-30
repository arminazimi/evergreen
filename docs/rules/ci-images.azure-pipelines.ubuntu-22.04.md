---
title: "Azure Pipelines Ubuntu 22.04 hosted image is scheduled for removal — dates, impact, migration"
description: "The Ubuntu 22.04 hosted image deprecation starts on 2026-09-17 and its scheduled removal is 2027-04-17, per Microsoft's hosted image deprecation schedule."
canonical_url: "https://arminazimi.github.io/evergreen/rules/ci-images.azure-pipelines.ubuntu-22.04.html"
image: "/assets/og/ci-images.azure-pipelines.ubuntu-22.04.svg"
json_twin: "/rules/ci-images.azure-pipelines.ubuntu-22.04.json"
---

# Azure Pipelines Ubuntu 22.04 hosted image is scheduled for removal

**Scheduled end of life** as of 2027-04-17. Replacement: ubuntu-latest, ubuntu-24.04, or ubuntu-26.04. Source: [Microsoft-hosted image deprecation schedule](https://learn.microsoft.com/azure/devops/pipelines/agents/hosted-deprecation-schedule).

Check a version:

```bash
evergreen check pkg:generic/azure-pipelines/ubuntu-image
```

The Ubuntu 22.04 hosted image deprecation starts on 2026-09-17 and its scheduled removal is 2027-04-17, per Microsoft's hosted image deprecation schedule.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

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
| Rule ID | `ci-images.azure-pipelines.ubuntu-22.04` |

## Sources

- [Microsoft-hosted image deprecation schedule](https://learn.microsoft.com/azure/devops/pipelines/agents/hosted-deprecation-schedule)

## Migration

**Constraints**

- Change only Microsoft-hosted pool.vmImage labels. The Ubuntu 22.04 schedule does not apply to self-hosted Ubuntu 22.04 agents.
- Move off ubuntu-22.04 before the scheduled removal on 2027-04-17. The notice names ubuntu-latest, ubuntu-24.04, or ubuntu-26.04.

**Steps**

1. **Retarget the hosted image.** Change the reported pool.vmImage from ubuntu-22.04 to ubuntu-latest, ubuntu-24.04, or ubuntu-26.04 (see the replacement).
2. **Align other Azure Pipelines pools.** Update every other azure-pipelines.yml pool, including stage and job pools, that still pins ubuntu-22.04. Leave self-hosted pool names unchanged.

**Verification**

- `gitlab-ci-lint || circleci config validate`: Lint .gitlab-ci.yml with gitlab-ci-lint, or .circleci/config.yml with circleci config validate, when the repository has that file. Azure Pipelines has no equivalent local validator: queue the pipeline and confirm the job uses the replacement vmImage.

## Detected by

The `ci-images` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/ci-images.json`](https://github.com/arminazimi/evergreen/blob/main/registry/ci-images.json), rule `ci-images.azure-pipelines.ubuntu-22.04`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/ci-images.azure-pipelines.ubuntu-22.04.html",
      "url": "https://arminazimi.github.io/evergreen/rules/ci-images.azure-pipelines.ubuntu-22.04.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/ci-images.azure-pipelines.ubuntu-22.04.html",
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
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/ci-images.azure-pipelines.ubuntu-22.04.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/ci-images.azure-pipelines.ubuntu-22.04.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/azure-pipelines/ubuntu-image?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Scheduled end of life as of 2027-04-17. Affected versions: vers:intdot/22.04. Source: Microsoft-hosted image deprecation schedule (https://learn.microsoft.com/azure/devops/pipelines/agents/hosted-deprecation-schedule)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/azure-pipelines/ubuntu-image?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "ubuntu-latest, ubuntu-24.04, or ubuntu-26.04"
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
