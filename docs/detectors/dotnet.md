# .NET

The `dotnet` detector reports .NET release lines that no longer receive fixes, in the SDK a repository pins and in the target frameworks of its projects, and direct NuGet dependencies their publisher has deprecated. It reads `global.json`, project files, `Directory.Build.props`, `Directory.Packages.props`, and `packages.lock.json`. It is **experimental**: it is scored on the [public corpus](../VALIDATION.md) but not yet held to the precision floor that stable detectors are. The reasoning is in [Decision 0012](../decisions/0012-dotnet-detector.md).

## What it reads

| File | Declaration |
| --- | --- |
| `global.json` | `sdk.version` |
| `*.csproj`, `*.fsproj`, `*.vbproj`, `Directory.Build.props` | `TargetFramework` and `TargetFrameworks` (a semicolon list, one declaration per entry) in a `PropertyGroup` |
| `*.csproj`, `*.fsproj`, `*.vbproj` | `PackageReference` items, with the version from the `Version` attribute or a `<Version>` child |
| `Directory.Packages.props` | `PackageVersion` items (central package management) |
| `packages.lock.json` | the resolved version of each `"type": "Direct"` dependency |
| `*.cs` | `using` directives and calls of deprecated packages, to list the files a migration touches |

It walks the repository up to eight directories deep (at most 500 matching files) and does not follow symbolic links. It skips `.git`, `node_modules`, `vendor`, `dist`, `build`, `bin`, `obj`, `target`, `.venv`, `venv`, `fixtures`, `__fixtures__`, and `testdata`. The `dotnet` CLI is never run and MSBuild is never evaluated.

## What it reports

- An SDK pin or a target framework on a release line that is past its end of support under the [.NET support policy](https://dotnet.microsoft.com/platform/support/policy/dotnet-core), at **high** severity. An SDK `X.Y.Z` belongs to the line `X.Y`, so `3.1.426` is the 3.1 line. `netcoreapp3.1`, `net5.0`, and `net6.0-windows` are read as the lines 3.1, 5.0, and 6.0. The rules cover 3.1, 5.0, 6.0, and 7.0 today.
- A line whose end Microsoft has announced but that has not happened yet (.NET 8 and 9, 2026-11-10) as a `scheduled-end-of-life` finding at **low** severity, so a severity gate set to `high` does not fail on a date that is still ahead. When the date has passed, a reviewed change turns the rule into the end-of-support rule with the same id ([decision 0010](../decisions/0010-scheduled-end-of-life.md)).
- A direct `PackageReference` or `PackageVersion` on a NuGet package whose publisher deprecated every version as legacy, at **medium** severity. The registry has one such rule today, for `WindowsAzure.Storage` (replaced by the `Azure.Storage.*` packages).
- A `Direct` entry in `packages.lock.json`, only for a rule that names specific versions. A package deprecated at every version is reported once, where it is declared.
- For the package rule, the `.cs` files that import or call it, with an impact summary.

Each finding carries its rule's source, replacement, migration steps, and verification commands (`dotnet build && dotnet test`).

## What it intentionally does not judge

- `netstandard2.0` and `netstandard2.1` are API specifications, not runtimes, and have no end of life. They are ignored.
- .NET Framework targets (`net48`, `net472`, ...) follow the Windows lifecycle, not the .NET policy. They are listed as unclassified.
- An MSBuild property (`$(TargetFramework)`, `Version="$(Ver)"`), a floating version (`1.*`), and a version range (`[1.0,2.0)`) cannot be decided without evaluating MSBuild. They are listed as unclassified with their file and line, never guessed.
- Anything under an element or group with a `Condition`, and anything set through `<Import>` or inherited from a file Evergreen is not looking at, is skipped.
- A `PackageReference` with no version is unclassified, unless central package management (`ManagePackageVersionsCentrally` set to `true`) is enabled in its directory or above, where the version is judged in `Directory.Packages.props`.
- A `global.json` without `sdk.version`, a version that is not a number, and a version under `msbuild-sdks` (which belongs to a build SDK package, not to .NET) pin no SDK.
- Malformed or oversized files (over 1 MiB) produce nothing, not partial results. A `global.json` may contain comments but not a trailing comma.
- Releases older than 3.1 (1.x, 2.x, 3.0) have no rule yet, so they are not reported. This is a data gap, not a statement that they are supported.

## Known limits and false-positive boundaries

- A target framework is a statement about what the project builds for. A library can multi-target an old line on purpose; Evergreen reports the declaration and cannot know the intent. A `global.json` SDK pin names the toolchain that builds the repository, which is closer to the truth.
- A sample, test, or tool project in a repository that still targets an old line is reported like any other project.
- Source usage is found for `.cs` files only. `using` directives, aliases, `global using`, a type reached by its full name, and a type reached by its simple name when its own namespace is imported are found. A method called on an instance (`account.CreateCloudBlobClient()`) is not, `using static` binds no name, F# and Visual Basic sources are not read, and a verbatim string that ends in a backslash can confuse the masking of strings and comments.

## Data

The rules are in `registry/dotnet.json` and ship in the [data bundle](../DATA.md). The importers `dotnet-1` (the official releases index) and `dotnet-2` (NuGet deprecation metadata for a reviewed list of packages) draft new rules for review; see [Lifecycle importers](../IMPORTERS.md).

## Validation

Six public repositories at pinned commits are in the corpus: four that targeted a past-support line or depended on a deprecated package until their maintainers moved on (Sloth, Sharp.BlobStorage, sourcelink, machinery), one whose test projects target .NET 8 and so carry the scheduled low-severity finding (xunit.analyzers), and one with no findings (LibreAutomate, which targets `net10.0-windows`). Their 23 expected findings were reviewed by hand against the files at that commit, and each note links the maintainers' own migration commit. Precision is measured on those six repositories only, which is why the detector is not yet stable.
