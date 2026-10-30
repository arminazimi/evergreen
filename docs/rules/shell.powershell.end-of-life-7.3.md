---
title: "PowerShell 7.3 is no longer supported — dates, impact, migration"
description: "Microsoft's PowerShell support lifecycle lists 7.3 (built on .NET 7.0) as retired: support ended on 2024-05-08, so it receives no further updates, including security updates."
canonical_url: "https://arminazimi.github.io/evergreen/rules/shell.powershell.end-of-life-7.3.html"
json_twin: "/rules/shell.powershell.end-of-life-7.3.json"
---

# PowerShell 7.3 is no longer supported

**End of life** as of 2024-05-08. Replacement: PowerShell 7.6 (LTS) or later. Source: [PowerShell support lifecycle](https://learn.microsoft.com/powershell/scripting/install/powershell-support-lifecycle).

Check a version:

```bash
evergreen check pkg:generic/powershell
```

Microsoft's PowerShell support lifecycle lists 7.3 (built on .NET 7.0) as retired: support ended on 2024-05-08, so it receives no further updates, including security updates. A script or manifest that requires 7.3 targets an unsupported release.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `shell` |
| Component | `pkg:generic/powershell` |
| Affected versions | `vers:semver/>=7.3.0\|<7.4.0` |
| Date from the source | 2024-05-08 |
| Replacement | PowerShell 7.6 (LTS) or later |
| Evidence last seen | 2026-10-22 |
| Reviewed | 2026-10-22 by arminazimi |
| Review due | 2027-01-20 (90 days after the last review) |
| Rule ID | `shell.powershell.end-of-life-7.3` |

## Sources

- [PowerShell support lifecycle](https://learn.microsoft.com/powershell/scripting/install/powershell-support-lifecycle)

## Migration

**Constraints**

- Raising a minimum version in `#Requires -Version` or `PowerShellVersion` stops the script or module from loading on any host that still runs PowerShell 7.3. Confirm every runner, container, and developer machine that executes it can run the target first.
- Scripts written for Windows PowerShell 5.1 often rely on Windows-only modules and cmdlets. Test them on PowerShell 7 before dropping 5.1 support, and keep a separate minimum for modules that must still load on Windows PowerShell.
- Update the declaration to a supported release from the replacement. Evergreen suggests these changes and never runs them.

**Steps**

1. **Find where the script runs.** List the CI jobs, container images, scheduled tasks, and developer setups that execute the reported file, and note which of them still provide PowerShell 7.3.
2. **Install the target PowerShell.** Install a supported PowerShell 7 release (the replacement) on those hosts, or change the pinned mcr.microsoft.com/powershell image tag in the workflow to a supported tag.
3. **Raise the declared version.** Change `#Requires -Version` or `PowerShellVersion` on the reported line to the minimum release the code truly needs, and no lower than a supported release. Do this in every script, module manifest, and workflow image that states the old version.
4. **Run the scripts and tests on the new release.** Run the script, its Pester tests, and any module import on the target release, and fix breaking changes in cmdlet behavior or removed APIs.

**Verification**

- `pwsh -NoProfile -Command "$PSVersionTable"`: Show the PowerShell version and edition that will run the script, and confirm it is a supported release.
- `pwsh -NoProfile -Command "Get-Module -ListAvailable | Select-Object Name, Version, PowerShellVersion"`: List installed modules and the PowerShell versions they require, to confirm none still demands the old release.

## Detected by

The `shell` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/shell.json`](https://github.com/arminazimi/evergreen/blob/main/registry/shell.json), rule `shell.powershell.end-of-life-7.3`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/shell.powershell.end-of-life-7.3.html",
      "url": "https://arminazimi.github.io/evergreen/rules/shell.powershell.end-of-life-7.3.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/shell.powershell.end-of-life-7.3.html",
      "headline": "PowerShell 7.3 is no longer supported — dates, impact, migration",
      "description": "Microsoft's PowerShell support lifecycle lists 7.3 (built on .NET 7.0) as retired: support ended on 2024-05-08, so it receives no further updates, including security updates.",
      "inLanguage": "en",
      "dateModified": "2026-10-22",
      "keywords": [
        "end-of-life",
        "shell",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "PowerShell 7.3 is no longer supported",
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
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/shell.powershell.end-of-life-7.3.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/shell.powershell.end-of-life-7.3.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/powershell?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life as of 2024-05-08. Affected versions: vers:semver/>=7.3.0|\u003c7.4.0. Source: PowerShell support lifecycle (https://learn.microsoft.com/powershell/scripting/install/powershell-support-lifecycle)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/powershell?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "PowerShell 7.6 (LTS) or later"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/powershell?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/powershell."
          }
        }
      ]
    }
  ]
}
</script>
