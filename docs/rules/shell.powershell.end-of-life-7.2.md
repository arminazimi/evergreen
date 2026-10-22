---
title: "PowerShell 7.2 (LTS) is no longer supported — dates, impact, migration"
description: "Microsoft's PowerShell support lifecycle lists 7.2 LTS (built on .NET 6.0) as retired: support ended on 2024-11-08, so it receives no further updates, including security updates."
canonical_url: "https://arminazimi.github.io/evergreen/rules/shell.powershell.end-of-life-7.2.html"
---

# PowerShell 7.2 (LTS) is no longer supported

Microsoft's PowerShell support lifecycle lists 7.2 LTS (built on .NET 6.0) as retired: support ended on 2024-11-08, so it receives no further updates, including security updates. A script or manifest that requires 7.2 targets an unsupported release.

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `shell` |
| Component | `pkg:generic/powershell` |
| Affected versions | `vers:semver/>=7.2.0\|<7.3.0` |
| Date from the source | 2024-11-08 |
| Replacement | PowerShell 7.6 (LTS) or later |
| Evidence last seen | 2026-10-22 |
| Reviewed | 2026-10-22 by arminazimi |
| Review due | 2027-01-20 (90 days after the last review) |
| Rule ID | `shell.powershell.end-of-life-7.2` |

## Sources

- [PowerShell support lifecycle](https://learn.microsoft.com/powershell/scripting/install/powershell-support-lifecycle)

## Detected by

The `shell` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/shell.json`](https://github.com/arminazimi/evergreen/blob/main/registry/shell.json), rule `shell.powershell.end-of-life-7.2`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/shell.powershell.end-of-life-7.2.html",
  "url": "https://arminazimi.github.io/evergreen/rules/shell.powershell.end-of-life-7.2.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/shell.powershell.end-of-life-7.2.html",
  "headline": "PowerShell 7.2 (LTS) is no longer supported — dates, impact, migration",
  "description": "Microsoft's PowerShell support lifecycle lists 7.2 LTS (built on .NET 6.0) as retired: support ended on 2024-11-08, so it receives no further updates, including security updates.",
  "inLanguage": "en",
  "dateModified": "2026-10-22",
  "keywords": [
    "end-of-life",
    "shell",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "PowerShell 7.2 (LTS) is no longer supported",
    "identifier": "pkg:generic/powershell"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "PowerShell support lifecycle",
      "url": "https://learn.microsoft.com/powershell/scripting/install/powershell-support-lifecycle"
    }
  ],
  "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/shell.json",
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen"
  }
}
</script>
