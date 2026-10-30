---
title: ".NET Core 3.0 is no longer supported — dates, impact, migration"
description: ".NET Core 3.0 (Standard Term Support) reached the end of its support on 2020-03-03. Microsoft no longer ships security or quality fixes for it."
canonical_url: "https://arminazimi.github.io/evergreen/rules/dotnet.runtime.end-of-support-3.0.html"
json_twin: "/rules/dotnet.runtime.end-of-support-3.0.json"
---

# .NET Core 3.0 is no longer supported

**End of support** as of 2020-03-03. Replacement: .NET 10 (LTS), or the newest supported .NET release. Source: [.NET and .NET Core official support policy](https://dotnet.microsoft.com/platform/support/policy/dotnet-core).

Check a version:

```bash
evergreen check pkg:generic/dotnet
```

.NET Core 3.0 (Standard Term Support) reached the end of its support on 2020-03-03. Microsoft no longer ships security or quality fixes for it. The same line applies to the SDK that carries it, so a global.json pinning an SDK 3.0.x is reported too.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `dotnet` |
| Component | `pkg:generic/dotnet` |
| Affected versions | `vers:semver/>=3.0.0\|<3.1.0` |
| Date from the source | 2020-03-03 |
| Replacement | .NET 10 (LTS), or the newest supported .NET release |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi, drafted by the `dotnet-1` importer |
| Review due | 2027-01-17 (90 days after the last review) |
| Rule ID | `dotnet.runtime.end-of-support-3.0` |

## Sources

- [.NET and .NET Core official support policy](https://dotnet.microsoft.com/platform/support/policy/dotnet-core)
- [.NET releases index (channel, support phase, end-of-life date)](https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json)

## Migration

**Constraints**

- Move the project files, global.json, CI images, and container base images to the same release line; a mix hides the old runtime.
- Read the breaking-changes list of each release between the old and new line before raising the target.

**Steps**

1. **Raise the target framework.** Change the reported TargetFramework (or TargetFrameworks entry) from the 3.0 line to a supported one, for example net10.0.
2. **Raise the SDK pin.** Update the sdk version in global.json to an SDK of the same supported line, or remove the pin if the repository does not need one.
3. **Align CI and container images.** Update setup-dotnet versions in CI and the mcr.microsoft.com/dotnet images in Dockerfiles to the new line.

**Verification**

- `dotnet --list-sdks && dotnet --list-runtimes`: Confirm the SDK and runtime in use are the intended supported release.
- `dotnet build && dotnet test`: Build and test every project on the new target.

## Detected by

The `dotnet` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/dotnet.json`](https://github.com/arminazimi/evergreen/blob/main/registry/dotnet.json), rule `dotnet.runtime.end-of-support-3.0`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/dotnet.runtime.end-of-support-3.0.html",
  "url": "https://arminazimi.github.io/evergreen/rules/dotnet.runtime.end-of-support-3.0.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/dotnet.runtime.end-of-support-3.0.html",
  "headline": ".NET Core 3.0 is no longer supported — dates, impact, migration",
  "description": ".NET Core 3.0 (Standard Term Support) reached the end of its support on 2020-03-03. Microsoft no longer ships security or quality fixes for it.",
  "inLanguage": "en",
  "dateModified": "2026-10-19",
  "keywords": [
    "end-of-support",
    "dotnet",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": ".NET Core 3.0 is no longer supported",
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
