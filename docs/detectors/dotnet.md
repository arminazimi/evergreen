# .NET

The `dotnet` detector reports .NET release lines that no longer receive fixes, in the SDK a repository pins and in the target frameworks of its projects, and direct NuGet dependencies their publisher has deprecated. It reads `global.json`, project files, `Directory.Build.props`, `Directory.Packages.props`, and `packages.lock.json`. It is **beta** ([decision 0013](../decisions/0013-detector-maturity.md)): it is scored on the [public corpus](../VALIDATION.md) and held to the 0.95 precision floor, and a change to one of its rule ids, finding ids, or documented declaration forms is listed in the changelog. The reasoning for the detector is in [Decision 0012](../decisions/0012-dotnet-detector.md).

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

- An SDK pin or a target framework on a release line that is past its end of support under the [.NET support policy](https://dotnet.microsoft.com/platform/support/policy/dotnet-core), at **high** severity. An SDK `X.Y.Z` belongs to the line `X.Y`, so `3.1.426` is the 3.1 line. `netcoreapp3.1`, `net5.0`, and `net6.0-windows` are read as the lines 3.1, 5.0, and 6.0. The rules cover 1.0, 1.1, 2.0, 2.1, 2.2, 3.0, 3.1, 5.0, 6.0, and 7.0 today; .NET Core 3.0 and older are named ".NET Core X.Y" in the findings.
- A line whose end Microsoft has announced but that has not happened yet (.NET 8 and 9, 2026-11-10) as a `scheduled-end-of-life` finding at **low** severity, so a severity gate set to `high` does not fail on a date that is still ahead. When the date has passed, a reviewed change turns the rule into the end-of-support rule with the same id ([decision 0010](../decisions/0010-scheduled-end-of-life.md)).
- A direct `PackageReference` or `PackageVersion` on a NuGet package whose publisher deprecated every version as legacy, at **medium** severity. The registry has four such rules today: `WindowsAzure.Storage` and `Microsoft.Azure.Storage.Blob` (replaced by the `Azure.Storage.*` packages), `Microsoft.Azure.DocumentDB` (replaced by `Microsoft.Azure.Cosmos`), and `Microsoft.Azure.ServiceBus` (replaced by `Azure.Messaging.ServiceBus`).
- A `Direct` entry in `packages.lock.json`, only for a rule that names specific versions. A package deprecated at every version is reported once, where it is declared.
- For the package rule, the `.cs` files that import or call it, with an impact summary.

Each finding carries its rule's source, replacement, migration steps, and verification commands (`dotnet build && dotnet test`).

## What it intentionally does not judge

- `netstandard2.0` and `netstandard2.1` are API specifications, not runtimes, and have no end of life. They are ignored.
- .NET Framework targets (`net48`, `net472`, ...) follow the Windows lifecycle, not the .NET policy. They are listed as unclassified; see [Decisions for the forms outside the project files](#decisions-for-the-forms-outside-the-project-files).
- An MSBuild property (`$(TargetFramework)`, `Version="$(Ver)"`), a floating version (`1.*`), and a version range (`[1.0,2.0)`) cannot be decided without evaluating MSBuild. They are listed as unclassified with their file and line, never guessed.
- Anything under an element or group with a `Condition`, and anything set through `<Import>` or inherited from a file Evergreen is not looking at, is skipped.
- A `PackageReference` with no version is unclassified, unless central package management (`ManagePackageVersionsCentrally` set to `true`) is enabled in its directory or above, where the version is judged in `Directory.Packages.props`.
- A `global.json` without `sdk.version`, a version that is not a number, and a version under `msbuild-sdks` (which belongs to a build SDK package, not to .NET) pin no SDK.
- Malformed or oversized files (over 1 MiB) produce nothing, not partial results. A `global.json` may contain comments but not a trailing comma.
- A `dotnet-version` given to `actions/setup-dotnet` and a `mcr.microsoft.com/dotnet/*` base image in a Dockerfile name a runtime too, but this detector does not read workflows or Dockerfiles, so an end-of-support line that appears only there is not reported. The finding for the project file or `global.json` of the same repository is.

## Decisions for the forms outside the project files

[#827](https://github.com/arminazimi/evergreen/issues/827) listed the .NET forms that got no verdict. Each one is now either judged or recorded as out of scope, with the reason:

| Form | Decision | Reason |
| --- | --- | --- |
| .NET Framework targets (`net48`, `net472`, `v4.x` in `TargetFrameworkVersion`) | **Out of scope.** Still listed as unclassified. | Framework is supported as part of Windows, so each version follows the lifecycle of the Windows releases it ships with, not the .NET release policy that every rule here cites. A rule needs an authoritative Microsoft lifecycle source per version and a statement of which Windows releases it assumes; the releases index the `dotnet-1` importer reads has no Framework data. Judging it from the .NET policy would be a guess. A future decision may add a Framework rule set with its own source. |
| MSBuild properties, `<Import>` chains, and `Condition`s | **Out of scope.** Properties are unclassified; imported and conditional values are skipped. | A target set in an imported file or a property needs MSBuild evaluation: resolving the import graph, property functions, and conditions. Evergreen parses repository files and never evaluates them or runs `dotnet`, so a verdict would be a guess. A repository can put the target where it is read: a literal `TargetFramework` in the project, or a `global.json` pin. |
| `dotnet-version` of `actions/setup-dotnet` | **Judged**, by the `github-actions` detector with this detector's rules. | The version lives in a workflow, which this detector does not read. See [the GitHub Actions detector](../DETECTORS.md#the-runtime-a-setup--action-installs) ([#845](https://github.com/arminazimi/evergreen/issues/845)). |
| `mcr.microsoft.com/dotnet/*` base images | **Judged**, by the `container` detector with this detector's rules. | The tag lives in a Dockerfile or Compose file. See [Container base images](container.md#what-it-matches) ([#846](https://github.com/arminazimi/evergreen/issues/846)). |

## Known limits and false-positive boundaries

- A target framework is a statement about what the project builds for. A library can multi-target an old line on purpose; Evergreen reports the declaration and cannot know the intent. A `global.json` SDK pin names the toolchain that builds the repository, which is closer to the truth.
- A sample, test, or tool project in a repository that still targets an old line is reported like any other project.
- Source usage is found for `.cs` files only. `using` directives, aliases, `global using`, a type reached by its full name, and a type reached by its simple name when its own namespace is imported are found. Verbatim strings (`@"…"`, `$@"…"`), including ones that end in a backslash, contain doubled quotes, or span lines, are masked correctly, so code after them is still read. Three cases are deliberate limits, because attributing them would need type or symbol resolution that a text scan cannot do without guessing:
  - A method called on an instance (`account.CreateCloudBlobClient()`) is not found. The receiver's type is declared elsewhere (a field, a parameter, `var`), and matching on the method name alone would report unrelated types that share it. The file is still listed if it has the `using` directive.
  - `using static N.Type;` is reported as an import but binds no name. A bare `Parse()` may be a member of the enclosing class, which C# prefers over the imported one, so it is not attributed.
  - F# (`*.fs`) and Visual Basic (`*.vb`) sources are not read. Their import and call syntax differs from C#, and the project files that declare the packages are read regardless.

## Data

The rules are in `registry/dotnet.json` and ship in the [data bundle](../DATA.md). The importers `dotnet-1` (the official releases index) and `dotnet-2` (NuGet deprecation metadata for a reviewed list of packages) draft new rules for review; see [Lifecycle importers](../IMPORTERS.md).

## Validation

Eighteen public repositories at pinned commits are in the corpus, scored by every detector. Six were chosen knowing their result (`selection: "targeted"`): four that targeted a past-support line or depended on a deprecated package until their maintainers moved on (Sloth, Sharp.BlobStorage, sourcelink, machinery), one whose test projects target .NET 8 and so carry the scheduled low-severity finding (xunit.analyzers), and one with no findings (LibreAutomate, which targets `net10.0-windows`). Twelve were chosen by a rule fixed before Evergreen ran on them (`selection: "blind"`), described in [Validation](../VALIDATION.md#net-blind-selection). Eight of them have no finding because they target .NET Framework or `netstandard`, which this detector does not judge. Four have findings: Ceras (`netcoreapp2.1` and `2.2`, which had no rule until this change, so the first scan of it missed them), DlibDotNet (`netcoreapp2.0`, `2.1`, and `3.1`), Chrome-Developer-Mode-Extension-Warning-Patcher (`net6.0`), and SharpSocks (`net5.0` and `net6.0`).

Across the eighteen repositories there are 84 expected `dotnet` findings, all matched. For the twelve blind repositories, the target frameworks, SDK pins, and package references were listed by hand and compared with the report: every judged form was reported and nothing else was (the 50 findings in DlibDotNet are 46 `netcoreapp2.0`, two `netcoreapp2.1`, and two `netcoreapp3.1` declarations, counted independently of Evergreen). Recall is therefore measured on the forms in "What it reads" only; the unjudged forms listed above are outside it, and the blind sample shows they matter: two of the twelve repositories name a runtime in a workflow or Dockerfile that is not read. The counts, selection, and precision floor are the evidence behind the `beta` level in `benchmarks/thresholds.json`.
