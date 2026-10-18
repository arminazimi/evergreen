# .NET fixtures

These fixtures define the parser boundary for .NET declarations (see [decision 0012](../../../docs/decisions/0012-dotnet-detector.md)). Parsers return exact one-based line numbers, return nothing for unsupported or dynamic forms, and never throw for malformed input.

| Fixture | Expected case |
| --- | --- |
| `positive/global.json` | `sdk.version` `3.1.426` (line 3), which belongs to the 3.1 line. `rollForward` (line 4) is read but never judged. |
| `positive/app/Program.cs` | C# source that uses WindowsAzure.Storage: three `using` directives (lines 2-4, one an alias), `CloudStorageAccount.Parse` (line 13), `new CloudBlobContainer` through the imported namespace (line 15), `new Az.CloudQueueClient` through the alias (line 16), and a fully qualified `CloudTableClient` (line 17). A commented-out call (line 6), a string that looks like a call (line 18), `account.CreateCloudBlobClient()` (a method on an instance), and a `using` statement (line 19) are not usages. |
| `negative/Unrelated.cs` | A `Contoso.Storage` namespace with look-alike names: a member access on a variable, another namespace's `CloudBlobClient`, a comment, and a string: no usages. |
| `positive/app/App.csproj` | `TargetFramework` `netcoreapp3.1` (line 5); `PackageReference` with a `Version` attribute (line 10 `WindowsAzure.Storage` 9.3.3, line 11 `Newtonsoft.Json` 13.0.3) and with a `<Version>` child element (line 12 `Microsoft.Azure.ServiceBus`, version on line 13). `LangVersion` (line 6) is never judged. |
| `positive/lib/Lib.fsproj` | `TargetFrameworks` list on line 4: `netstandard2.0` is never judged, `net6.0` is past end of support, `net8.0` is scheduled to end support on 2026-11-10, so it is reported at low severity. |
| `positive/lib/Win.vbproj` | An OS-specific moniker, `net5.0-windows` (line 4), belongs to the 5.0 line. |
| `positive/central/Directory.Build.props` | `TargetFramework` `net6.0` (line 4). `ManagePackageVersionsCentrally` (line 5) is read, not judged. |
| `positive/central/Directory.Packages.props` | `PackageVersion` entries (line 4 `WindowsAzure.Storage` 9.3.3, line 5 `Serilog` 3.1.1). |
| `positive/lock/packages.lock.json` | A `Direct` dependency `WindowsAzure.Storage` resolved to 9.3.3 (key on line 5, `resolved` on line 8). The `Transitive` `Newtonsoft.Json` (line 11) is not a declaration of the project. |
| `negative/Dynamic.csproj` | Commented-out targets and packages, a target written as `$(Tfm)`, prose in `Description`, a property version, a floating version (`5.*`), a version range, and a `PackageReference` with no version produce no declarations. |
| `negative/Targets.csproj` | `netstandard2.0` (specification, not a runtime), `net48` (.NET Framework, out of scope) and `net10.0` (supported for years): nothing to judge. |
| `negative/global.json` | A version under `msbuild-sdks` and an `sdk` object with no `version`: no SDK is pinned. |
| `negative/packages.lock.json` | A `Transitive` dependency and a `Project` entry produce no judged dependency. |
| `zero/` | A project on `net10.0`, SDK `10.0.100`, and a current package: no findings. |
| `malformed/Broken.csproj`, `global.json` (trailing comma), `packages.lock.json` (not an object), `Directory.Packages.props` | Truncated or invalid input is handled without throwing and without partial results. |
