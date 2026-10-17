---
title: ".NET 6 is no longer supported"
description: ".NET 6 (Long Term Support) reached the end of its support on 2024-11-12. Microsoft no longer ships security or quality fixes for it."
---

# .NET 6 is no longer supported

.NET 6 (Long Term Support) reached the end of its support on 2024-11-12. Microsoft no longer ships security or quality fixes for it. The same line applies to the SDK that carries it, so a global.json pinning an SDK 6.0.x is reported too.

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `dotnet` |
| Component | `pkg:generic/dotnet` |
| Affected versions | `vers:semver/>=6.0.0\|<7.0.0` |
| Date from the source | 2024-11-12 |
| Replacement | .NET 10 (LTS), or the newest supported .NET release |
| Evidence last seen | 2026-10-17 |
| Reviewed | 2026-10-17 by arminazimi |
| Review due | 2027-01-15 (90 days after the last review) |
| Rule ID | `dotnet.runtime.end-of-support-6.0` |

## Sources

- [.NET and .NET Core official support policy](https://dotnet.microsoft.com/platform/support/policy/dotnet-core)
- [.NET releases index (channel, support phase, end-of-life date)](https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json)

## Migration

**Constraints**

- Move the project files, global.json, CI images, and container base images to the same release line; a mix hides the old runtime.
- Read the breaking-changes list of each release between the old and new line before raising the target.

**Steps**

1. **Raise the target framework.** Change the reported TargetFramework (or TargetFrameworks entry) from the 6.0 line to a supported one, for example net10.0.
2. **Raise the SDK pin.** Update the sdk version in global.json to an SDK of the same supported line, or remove the pin if the repository does not need one.
3. **Align CI and container images.** Update setup-dotnet versions in CI and the mcr.microsoft.com/dotnet images in Dockerfiles to the new line.

**Verification**

- `dotnet --list-sdks && dotnet --list-runtimes`: Confirm the SDK and runtime in use are the intended supported release.
- `dotnet build && dotnet test`: Build and test every project on the new target.

## Detected by

No built-in detector reads `dotnet` declarations yet; the rule is data in the [lifecycle registry](https://github.com/arminazimi/evergreen/blob/main/registry/dotnet.json).

## Data

This page is generated from [`registry/dotnet.json`](https://github.com/arminazimi/evergreen/blob/main/registry/dotnet.json), rule `dotnet.runtime.end-of-support-6.0`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
