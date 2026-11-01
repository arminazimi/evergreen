---
title: "Is your repo affected? .NET 8 and 9 reach end of support on 2026-11-10"
---

# Is your repo affected? .NET 8 and 9 reach end of support on 2026-11-10

Microsoft's releases index schedules **.NET 8** (Long Term Support) and **.NET 9** (Standard Term Support) to reach the end of their support on **2026-11-10**. After that date Microsoft no longer ships security or quality fixes for either line. The same dates apply to the SDKs that carry them, so a `global.json` pinning an SDK 8.0.x or 9.0.x is affected too.

## Who is affected

.NET repositories whose project files target `net8.0` or `net9.0`, or whose `global.json` pins an SDK on the 8.0 or 9.0 line. The `dotnet` detector reports those declarations. A `mcr.microsoft.com/dotnet/*` base image and a `dotnet-version` in `actions/setup-dotnet` name the same runtimes; they are reported by the `container` and `github-actions` detectors with these rules.

## Check your repository

```bash
npx evergreen-deprecation scan
```

Look for rules `dotnet.runtime.end-of-support-8.0` and `dotnet.runtime.end-of-support-9.0`.

## Migration steps

Replacement: .NET 10 (LTS), or the newest supported .NET release.

1. **Raise the target framework.** Change the reported `TargetFramework` (or `TargetFrameworks` entry) from the 8.0 or 9.0 line to a line that is still supported after 2026-11-10, for example `net10.0`.
2. **Raise the SDK pin.** Update the `sdk.version` in `global.json` to an SDK of the same supported line, or remove the pin if the repository does not need one.
3. **Align CI and container images.** Update `setup-dotnet` versions in CI and the `mcr.microsoft.com/dotnet` images in Dockerfiles to the new line.

Then verify with `dotnet --list-sdks && dotnet --list-runtimes` and `dotnet build && dotnet test`. Full constraints and verification commands are on the [.NET 9 rule page](../rules/dotnet.runtime.end-of-support-9.0.md) and the [.NET 8 rule page](../rules/dotnet.runtime.end-of-support-8.0.md).

## Sources

- [.NET and .NET Core official support policy](https://dotnet.microsoft.com/platform/support/policy/dotnet-core)
- [.NET releases index (channel, support phase, end-of-life date)](https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json)
- Rules: [`dotnet.runtime.end-of-support-8.0`](../rules/dotnet.runtime.end-of-support-8.0.md), [`dotnet.runtime.end-of-support-9.0`](../rules/dotnet.runtime.end-of-support-9.0.md)

Every claim above comes from the linked sources and the reviewed rules. The [lifecycle calendar](../EOL_CALENDAR.md) lists what ends next.
