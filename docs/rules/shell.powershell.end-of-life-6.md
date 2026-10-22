---
title: "PowerShell 6.x is no longer supported — dates, impact, migration"
description: "Microsoft's PowerShell support lifecycle lists every PowerShell 6 release (6.0, 6.1, and 6.2) as retired; the last, 6.2, reached end of support on 2020-09-04."
canonical_url: "https://arminazimi.github.io/evergreen/rules/shell.powershell.end-of-life-6.html"
---

# PowerShell 6.x is no longer supported

Microsoft's PowerShell support lifecycle lists every PowerShell 6 release (6.0, 6.1, and 6.2) as retired; the last, 6.2, reached end of support on 2020-09-04. A script or manifest that requires a 6.x version targets an unsupported release.

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `shell` |
| Component | `pkg:generic/powershell` |
| Affected versions | `vers:semver/>=6.0.0\|<7.0.0` |
| Date from the source | 2020-09-04 |
| Replacement | PowerShell 7.6 (LTS) or later |
| Evidence last seen | 2026-10-22 |
| Reviewed | 2026-10-22 by arminazimi |
| Review due | 2027-01-20 (90 days after the last review) |
| Rule ID | `shell.powershell.end-of-life-6` |

## Sources

- [PowerShell support lifecycle](https://learn.microsoft.com/powershell/scripting/install/powershell-support-lifecycle)

## Detected by

No built-in detector reads `shell` declarations yet; the rule is data in the [lifecycle registry](https://github.com/arminazimi/evergreen/blob/main/registry/shell.json).

## Data

This page is generated from [`registry/shell.json`](https://github.com/arminazimi/evergreen/blob/main/registry/shell.json), rule `shell.powershell.end-of-life-6`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/shell.powershell.end-of-life-6.html",
  "url": "https://arminazimi.github.io/evergreen/rules/shell.powershell.end-of-life-6.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/shell.powershell.end-of-life-6.html",
  "headline": "PowerShell 6.x is no longer supported — dates, impact, migration",
  "description": "Microsoft's PowerShell support lifecycle lists every PowerShell 6 release (6.0, 6.1, and 6.2) as retired; the last, 6.2, reached end of support on 2020-09-04.",
  "inLanguage": "en",
  "dateModified": "2026-10-22",
  "keywords": [
    "end-of-life",
    "shell",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "PowerShell 6.x is no longer supported",
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
