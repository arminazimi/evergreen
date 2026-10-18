# 0012 — Detect unsupported .NET targets and deprecated NuGet packages

Status: accepted

Evergreen will add a `dotnet` detector that reads `global.json`, project files, central package files, and `packages.lock.json`, and reports lifecycle risk that Microsoft states. It follows the existing [detector SDK](../DETECTORS.md) and the [v2 registry](0004-registry-v2.md); it adds no new engine behavior.

## What Microsoft says about its own lifecycle

- **Each .NET release line has a published end-of-support date.** The official support policy and the machine-readable [`releases-index.json`](https://github.com/dotnet/core/blob/main/release-notes/releases-index.json) list, per channel (`6.0`, `8.0`, ...), the release type (LTS or STS), the support phase, and `eol-date`. A line is unsupported on and after its `eol-date`. Past dates today: 7.0 (2024-05-14), 6.0 (2024-11-12), 5.0 (2022-05-10), 3.1 (2022-12-13), and older.
- **Dates in the future are not findings.** 8.0 and 9.0 have an announced end of support of 2026-11-10. Whether and how an announced date is recorded is an open proposal (pull request #686, not yet decided); until it is settled, this detector's rules cover only lines whose date has passed.
- **`netstandard` is not a runtime.** `netstandard2.0` and `netstandard2.1` are API specifications that many supported runtimes implement. They have no end-of-life date and are never judged.
- **.NET Framework (`net48`, `net472`, ...) follows the Windows lifecycle**, not the .NET release policy. It is out of scope for the first version; such targets are read and listed as unclassified, never judged.

## What the detector reads and judges

| Declaration | Files | Judged? |
|---|---|---|
| `sdk.version` | `global.json` | Yes: SDK `X.Y.Zxx` belongs to .NET line `X.Y` (SDK 6.0.400 is the 6.0 line) |
| `<TargetFramework>`, `<TargetFrameworks>` (semicolon list) | `*.csproj`, `*.fsproj`, `*.vbproj`, `Directory.Build.props` | Yes, for `netcoreapp<X.Y>` and `net<X.Y>` (`net5.0` and later), including OS-specific monikers such as `net6.0-windows` |
| `<PackageReference Include Version>` | project files | Yes, for direct packages with a rule |
| `<PackageVersion Include Version>` | `Directory.Packages.props` | Yes, for packages with a rule |
| Resolved versions of `"type": "Direct"` dependencies | `packages.lock.json` | Yes, for packages with a rule |
| `netstandard*`, `net<NNN>` (.NET Framework), `<LangVersion>` | project files | No |

Rules:

1. **Runtime and SDK lines.** One rule per line whose `eol-date` has passed (`pkg:generic/dotnet`, `vers:semver/>=6.0.0|<7.0.0`, event `end-of-support`), with the date and sources taken from `releases-index.json` and the support policy page. A finding is reported at the file and line of the declaration. The importer drafts these from `releases-index.json`; a person reviews them.
2. **Deprecated packages.** A rule for a direct package that its publisher has marked deprecated on NuGet, or that the publisher's own documentation says is replaced (`pkg:nuget/<id>`, event `deprecated`, with the replacement named). The NuGet deprecation metadata is the source; the importer drafts candidates and a person reviews them.

## What is dynamic, and what happens to it

A value is **dynamic** when MSBuild would need to evaluate it: `$(TargetFramework)` and any other `$(...)` property, an item or property with a `Condition` the detector cannot decide, `Version="$(SomeVersion)"`, version ranges (`[1.0,2.0)`), floating versions (`1.*`), and an SDK `rollForward` policy. Dynamic values produce **no finding** and no guess; where the engine reports unclassified references, a dynamic target or package version is listed there with its file and line. Evergreen does not evaluate MSBuild, imports (`<Import>`), or property inheritance across files, except that a project that sets no `TargetFramework` is not assumed to inherit one from `Directory.Build.props`.

`PackageReference` without a `Version` is judged against `Directory.Packages.props` only when central package management is literally enabled in the same repository (`ManagePackageVersionsCentrally` set to `true`); otherwise it is unclassified.

## Where facts come from

Allowed, and recorded in each rule's sources: the .NET support policy and `releases-index.json` (release lines and dates), and the NuGet deprecation metadata and the publisher's own documentation (package status). Rejected: download counts or popularity, "a newer version exists", `dotnet list package --outdated` output, vulnerability data, blog posts, and any date inferred from a release cadence.

## Where it looks

The detector walks the repository (eight directories deep, at most 500 matching files, never following symbolic links) and skips `.git`, `node_modules`, `vendor`, `dist`, `build`, `bin`, `obj`, `target`, `.venv`, `venv`, `fixtures`, `__fixtures__`, and `testdata`. The `dotnet` CLI is never run.

## Out of scope for the first version

.NET Framework and Mono, Xamarin and MAUI workloads, `app.config`/`web.config`, `packages.config`, `.sln` files, Docker images (covered by the container detector), transitive packages, vulnerability advisories, NuGet source configuration, and MSBuild evaluation of any kind.

## Examples for the fixture task

True positives:

- `global.json` with `"sdk": { "version": "3.1.426" }`
- `<TargetFramework>netcoreapp3.1</TargetFramework>` and `<TargetFrameworks>net6.0;net8.0</TargetFrameworks>` (6.0 is reported)
- `<TargetFramework>net5.0-windows</TargetFramework>`
- `Directory.Build.props` that sets `<TargetFramework>net6.0</TargetFramework>`
- a `PackageReference` or `PackageVersion` on a package with a deprecation rule, and the same package as `Direct` in `packages.lock.json`

Must not produce findings:

- the same text inside an XML comment, or in an unrelated element (`<Description>net6.0</Description>`)
- `<TargetFramework>$(Tfm)</TargetFramework>`, `Version="$(Ver)"`, `Version="1.*"`, `Version="[1.0,2.0)"`
- `netstandard2.0`, `net48`, `net8.0` (a supported line today)
- a package that is `"type": "Transitive"` in `packages.lock.json`
- `global.json` without `sdk`, or a `sdk.version` that is not a version

Malformed: an XML project that is truncated mid-element, a `global.json` with a trailing comma, and a `packages.lock.json` that is not an object. All must produce no findings and no crash.

## Consequences

- The detector is quiet by default: a target written as an MSBuild property gets no verdict, which is the honest answer.
- Rules for 8.0 and 9.0 wait for the scheduled-end-of-life decision rather than being added with future dates.
- Adding the detector means the scaffolded files and two registrations (`src/detectors/index.ts` and `BUNDLED_ECOSYSTEMS` in `src/data-bundle.ts`), as described in [DETECTORS.md](../DETECTORS.md).
