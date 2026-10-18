---
title: ".NET 8 reaches end of support on 2026-11-10 — dates, impact, migration"
description: ".NET 8 (Long Term Support) is scheduled to reach the end of its support on 2026-11-10, according to Microsoft's releases index."
canonical_url: "https://arminazimi.github.io/evergreen/rules/dotnet.runtime.end-of-support-8.0.html"
---

# .NET 8 reaches end of support on 2026-11-10

.NET 8 (Long Term Support) is scheduled to reach the end of its support on 2026-11-10, according to Microsoft's releases index. After that date Microsoft no longer ships security or quality fixes for it. The same line applies to the SDK that carries it, so a global.json pinning an SDK 8.0.x is reported too.

| | |
| --- | --- |
| Status | Scheduled end of life |
| Severity | low |
| Ecosystem | `dotnet` |
| Component | `pkg:generic/dotnet` |
| Affected versions | `vers:semver/>=8.0.0\|<8.1.0` |
| Date from the source | 2026-11-10 |
| Replacement | .NET 10 (LTS), or the newest supported .NET release |
| Evidence last seen | 2026-10-18 |
| Reviewed | 2026-10-18 by arminazimi |
| Review due | 2027-01-16 (90 days after the last review) |
| Rule ID | `dotnet.runtime.end-of-support-8.0` |

## Sources

- [.NET and .NET Core official support policy](https://dotnet.microsoft.com/platform/support/policy/dotnet-core)
- [.NET releases index (channel, support phase, end-of-life date)](https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json)

## Migration

**Constraints**

- Move the project files, global.json, CI images, and container base images to the same release line; a mix hides the old runtime.
- Read the breaking-changes list of each release between the old and new line before raising the target.
- This line is still supported today; the rule is a warning ahead of the announced date, so plan the move before it.

**Steps**

1. **Raise the target framework.** Change the reported TargetFramework (or TargetFrameworks entry) from the 8.0 line to a line that will still be supported after 2026-11-10, for example net10.0.
2. **Raise the SDK pin.** Update the sdk version in global.json to an SDK of the same supported line, or remove the pin if the repository does not need one.
3. **Align CI and container images.** Update setup-dotnet versions in CI and the mcr.microsoft.com/dotnet images in Dockerfiles to the new line.

**Verification**

- `dotnet --list-sdks && dotnet --list-runtimes`: Confirm the SDK and runtime in use are the intended supported release.
- `dotnet build && dotnet test`: Build and test every project on the new target.

## Detected by

The `dotnet` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/dotnet.json`](https://github.com/arminazimi/evergreen/blob/main/registry/dotnet.json), rule `dotnet.runtime.end-of-support-8.0`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/dotnet.runtime.end-of-support-8.0.html",
  "url": "https://arminazimi.github.io/evergreen/rules/dotnet.runtime.end-of-support-8.0.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/dotnet.runtime.end-of-support-8.0.html",
  "headline": ".NET 8 reaches end of support on 2026-11-10 — dates, impact, migration",
  "description": ".NET 8 (Long Term Support) is scheduled to reach the end of its support on 2026-11-10, according to Microsoft's releases index.",
  "inLanguage": "en",
  "dateModified": "2026-10-18",
  "keywords": [
    "scheduled-end-of-life",
    "dotnet",
    "low"
  ],
  "about": {
    "@type": "Thing",
    "name": ".NET 8 reaches end of support on 2026-11-10",
    "identifier": "pkg:generic/dotnet"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": ".NET and .NET Core official support policy",
      "url": "https://dotnet.microsoft.com/platform/support/policy/dotnet-core"
    },
    {
      "@type": "CreativeWork",
      "name": ".NET releases index (channel, support phase, end-of-life date)",
      "url": "https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json"
    }
  ],
  "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/dotnet.json",
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen"
  }
}
</script>
