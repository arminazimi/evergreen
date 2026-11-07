# Environment doctor and compatibility matrix

Evergreen can inspect its execution environment without scanning source files:

```bash
evergreen doctor .
evergreen doctor . --json
```

The doctor checks the Node.js runtime, installed package entry points, local MCP
server, portable Agent Skill, shared plugin prerequisites, and local or CI
workspace. It is read-only: it does not change configuration, execute suggested
repairs, start a network listener, or upload repository data.

`evergreen doctor --system` also asks `node`, `python3`, `go`, `java`, `dotnet`, and
`terraform` for their version (`--version`, or `-version` for Java, which works on
every release) and matches each against the bundled end-of-life and end-of-support
rules. The report lists each tool, its release line, and its status in a `system`
array; tools that are not installed are skipped. A tool that is out of support is a
warning, not a failure. Nothing else is run and nothing uses the network.

Text and JSON are generated from the same deterministic result. The JSON contract
is `evergreen.doctor.v1`; its schema is
[`schemas/doctor.v1.schema.json`](../schemas/doctor.v1.schema.json). A failed check
always includes a concrete remediation. Warnings describe usable but not yet stable
integration paths and do not make the command fail.

## Compatibility matrix

Matrix version: **2026-10-15 / v1**

| Surface | Combination | Status | Notes |
| --- | --- | --- | --- |
| CLI | Node.js 22+ on Linux | Supported | Primary local and CI execution path. |
| CLI | Node.js 22+ on macOS | Supported | Same deterministic CLI and JSON contracts; the full check runs on macOS in CI. |
| CLI | Node.js 24 on Linux | Supported | Part of the CI matrix next to Node.js 22. |
| CLI | Node.js 22+ on Windows | Supported | The full check runs on Windows in CI on every pull request. |
| GitHub Actions | Ubuntu runner | Supported | Composite Action, annotations, baselines, severity gate, and JSON artifact. |
| GitHub Actions | macOS runner | Experimental | Expected to work through `bash`; not yet in the required runner matrix. |
| GitHub Actions | Windows runner | Unsupported | The current composite Action requires `bash`. Use the CLI explicitly if available. |
| GitLab CI | Linux runner using the CLI | Experimental | Doctor detects `GITLAB_CI` and `CI_PROJECT_DIR`; a Catalog component is not published yet. |
| MCP | Local stdio host | Supported | No HTTP listener, account, credential, or hosted Evergreen service. |
| Agent Skill | skills.sh / skills CLI monorepo discovery | Supported | `arminazimi/evergreen` discovers and installs `evergreen-deprecation`. |
| Agent Skill | Codex, Claude Code, Cursor, GitHub Copilot, or Gemini CLI | Supported | Project installation validated through the skills CLI on 2026-10-15. |
| Agent Skill | Other hosts supporting the open Agent Skills directory format | Experimental | The portable files can be copied or linked, but these hosts are not in the representative install gate. |
| Host plugins | Codex or Claude packaged plugin | Experimental | Shared MCP and Skill prerequisites exist; stable host packages are not published yet. |

## v1 compatibility guarantees

From **1.0.0**, the 1.x line is a SemVer compatibility promise: a consumer that pins `evergreen-deprecation@^1` (or a specific 1.x release) can rely on the contracts below without a surprise break in a minor or patch release. Removals and replacements still follow the [deprecation policy](#deprecation-policy); this section states what each contract guarantees and how long that guarantee lasts on the 1.x line.

Scans stay offline and need no account. That property is part of the v1 promise and is not relaxed in a 1.x release.

### Support windows on 1.x

| Kind | Window on the 1.x line |
| --- | --- |
| A versioned document (`evergreen.*.vN`), its JSON Schema file, the detector SDK API version, the registry format, or the data-bundle format | Supported for the whole 1.x line. A successor (`vN+1`) may ship in a minor release; the older version keeps working at least through the [versioned-format notice period](#notice-periods) and is not removed before 2.0.0. |
| CLI commands, flags, and environment variables marked stable in the docs | Supported for the whole 1.x line. A rename or removal needs the [unversioned notice period](#notice-periods) and lands no earlier than 2.0.0. |
| MCP tools, resources, prompts, and their documented input fields | Same as CLI flags: whole 1.x line; removal only after notice, and not before 2.0.0. |
| GitHub Action and GitLab component inputs whose default preserves current behavior | Same as CLI flags. |
| Exit-code classes (`policy` 1, `usage` 2, `data` 3, `parse` 4, `internal` 5) | Stable for the whole 1.x line. New classes get new numbers; existing numbers are never renumbered. |
| Surfaces the matrix marks **Supported** or **Beta** | Get the windows above. |
| Surfaces the matrix marks **Experimental** | Usable, but may change in any minor release with a CHANGELOG entry; no multi-release window. |
| Node.js and other runtimes listed in the matrix | Dropped from the matrix only after that runtime reaches its own end of life, and only with a deprecation note in the release before the drop. |

A 1.x patch fixes behavior or security and does not add fields. A 1.x minor may add optional fields, commands, tools, or inputs. A required field, a rename, a type change, or a removal of a versioned format requires a new document version and the windows above — not a silent break inside 1.x.

### Per-contract guarantees

Each row is a published contract. The guarantee is the machine-readable shape: identifiers, field names, types, and exit codes. Help text, warning prose, and field order may change in any release. Consumers must ignore fields they do not know.

| Contract | Identifier / schema | Guarantee on 1.x |
| --- | --- | --- |
| Scan result | `evergreen.scan.v1` · [`scan.v1.schema.json`](../schemas/scan.v1.schema.json) | Required fields and types stay; optional fields may appear in a minor. A breaking change ships as `evergreen.scan.v2` while `v1` remains accepted for the window. |
| Dependency check | `evergreen.check.v1` · [`check.v1.schema.json`](../schemas/check.v1.schema.json) | Same additive rules. Status values already documented keep their meaning. |
| Migration context | `evergreen.context.v1` · [`context.v1.schema.json`](../schemas/context.v1.schema.json) | Packet shape stays; new optional sections may appear. |
| Deprecation list | `evergreen.deprecations.v1` · [`deprecations.v1.schema.json`](../schemas/deprecations.v1.schema.json) | Compact list shape stays for agents and planners. |
| Verification | `evergreen.verification.v1` · [`verification.v1.schema.json`](../schemas/verification.v1.schema.json) | Re-scan result shape stays. |
| Doctor | `evergreen.doctor.v1` · [`doctor.v1.schema.json`](../schemas/doctor.v1.schema.json) | Check and summary shape stays; new optional checks may appear. |
| Capabilities manifest | `evergreen.capabilities.v1` · [`capabilities.v1.schema.json`](../schemas/capabilities.v1.schema.json) | Manifest shape stays; new optional capability or surface entries may appear. |
| Baseline | `evergreen.baseline.v1` · [`baseline.v1.schema.json`](../schemas/baseline.v1.schema.json) | File format stays so CI baselines written under 1.x keep loading. |
| Config | `evergreen.config.v1` · [`config.v1.schema.json`](../schemas/config.v1.schema.json) | Documented keys keep their meaning; new optional keys may appear. |
| Rule document | `evergreen.rule.v1` · [`rule.v1.schema.json`](../schemas/rule.v1.schema.json) | Rule view shape stays for MCP resources and tooling. |
| Fix plan | `evergreen.fix.v1` · [`fix.v1.schema.json`](../schemas/fix.v1.schema.json) | Plan shape stays. |
| Data status | `evergreen.data-status.v1` · [`data-status.v1.schema.json`](../schemas/data-status.v1.schema.json) | Status shape stays. |
| CLI errors | `evergreen.error.v1` | `error.code` classes and exit codes stay as in [Exit codes](CAPABILITIES.md#exit-codes-and-error-codes). |
| Detector SDK | `evergreen.detector.v1` · [`src/sdk.ts`](../src/sdk.ts) | Detectors written to this API keep loading; a `v2` API may ship in parallel. |
| Registry file | `evergreen.registry.v2` · [`registry.v2.schema.json`](../schemas/registry.v2.schema.json) | `v2` registries keep validating and loading; a `v3` may ship in parallel. |
| Data bundle | `evergreen.data-bundle.v1` · [`data-bundle.v1.schema.json`](../schemas/data-bundle.v1.schema.json) | Bundle manifest shape stays; older bundles remain accepted for the window after a successor appears. |
| MCP server | Tool names, resource URIs, and input fields in [MCP](MCP.md) | Listed tools and resources keep working; new tools or optional inputs may appear. Output documents use the rows above. |
| GitHub Action / GitLab component | Input names in [GitHub Action](GITHUB_ACTION.md) and [GitLab](GITLAB.md) | Documented inputs keep their meaning; new inputs default to current behavior. |
| SARIF export | SARIF 2.1.0 from `scan --format sarif` | Remains valid SARIF 2.1.0; field mapping changes that would break code scanning need notice as for versioned formats. |
| Agent Skill | Portable skill layout and trigger description | Install and discovery paths for Supported hosts stay; host-specific packaging marked Experimental follows the experimental window. |

### Outside the v1 promise

These change without a contract break and are not covered by the windows above:

- **Lifecycle findings and rules.** Bundled data can add, change, or remove a finding when evidence changes. Pin a data version or use a [baseline](CAPABILITIES.md) to stabilize CI.
- **Detector maturity moves.** Promoting or demoting a detector between Experimental, Beta, and Supported follows [decision 0013](decisions/0013-detector-maturity.md).
- **Bug fixes** that correct a wrong location, match, or message.
- **Internals** not exported from `src/index.ts` or named in a schema, including maintainer scripts and test fixtures.
- **Human-readable wording** in CLI help, finding prose, and documentation.

Until 1.0.0 is tagged, Evergreen is still pre-1.0: the deprecation policy already applies, and this section is the contract that 1.0.0 will publish. Issue tracking for the release is in the [v1 epic](https://github.com/arminazimi/evergreen/issues/57).

## Deprecation policy

Evergreen reports other projects' deprecations. Its own interfaces follow the policy below, so a script, an agent, or a plugin built on Evergreen keeps working long enough to move.

### What the policy covers

| Interface | Version identifier | Additive change | Breaking change |
| --- | --- | --- | --- |
| CLI commands, flags, and environment variables | None | A new command, flag, or variable. | The old form is deprecated for a full window, then removed. |
| JSON output of `scan`, `check`, `explain`, `context`, `doctor`, and the other `--json` commands | `schemaVersion`, for example `evergreen.scan.v1` | A new optional field, added in a minor release. Consumers must ignore fields they do not know. | A new document version such as `evergreen.scan.v2`; `v1` keeps working for the window. |
| JSON Schemas in [`schemas/`](../schemas) | File name, for example `scan.v1.schema.json` | A new optional property. | A new `*.v2.schema.json` file; the `v1` file stays for the window. |
| MCP tools, resources, and prompts | Tool and resource URIs, input field names, and the same output `schemaVersion` | A new tool, prompt, optional input, or optional output field. | A new window, then a removal or a new output version. |
| Detector SDK ([`src/sdk.ts`](../src/sdk.ts)) | `evergreen.detector.v1` | A new optional member or a new context field. | `evergreen.detector.v2`; the engine keeps loading `v1` detectors during the window. |
| Registry format | `evergreen.registry.v2` | A new optional rule or registry field, accepted by the validator in the same release. | `evergreen.registry.v3`; `v2` registries are still read during the window. |
| Data bundle | `evergreen.data-bundle.v1` | A new optional manifest field. | A new bundle version; the old one is still accepted during the window. |
| GitHub Action and GitLab component inputs | Input names | A new input whose default preserves current behavior. | The old input or behavior is deprecated for a full window, then removed. |

The contract is the machine-readable part: command names, exit codes, field names, types, and schema versions. Human-readable wording, help text, warning prose, and field order may change in any release. A new optional field may appear in a `v1` document in a minor release; a required field, a rename, a removal, or a type change requires a new version. Patch releases fix behavior but do not add fields.

### Notice periods

| Change | Minimum notice before removal |
| --- | --- |
| CLI flag, environment variable, Action or component input, MCP tool, prompt, resource, or input field | 90 days and one minor release, whichever ends later. |
| A versioned format: JSON document, schema file, registry, bundle, or detector API | 12 months and two minor releases after its successor ships. |

The window starts in the release that announces the deprecation, not in the release that removes it, and it is measured from that release's date. Extensions are allowed; shortening a window is not, except for a security or correctness problem (below).

Before 1.0, semantic versioning would permit a minor release to break an interface; this policy is deliberately stricter and already applies. From 1.0.0, the [v1 compatibility guarantees](#v1-compatibility-guarantees) lock the same windows into the SemVer major line. Surfaces the matrix marks **Experimental** may change in any minor release with a CHANGELOG entry; **Beta** and **Supported** surfaces get the windows above. Runtime support is listed in the matrix; a runtime is dropped from it only after the runtime reaches its own end of life and with a deprecation note in the release before the drop.

### Removal process

1. **Open an issue** labeled `deprecation` that names the interface, the replacement, and the intended removal release.
2. **Record it** in the table below with the release it was deprecated in and the earliest release or date it may be removed.
3. **Announce it in a release**: a CHANGELOG entry, a note in the docs for the interface, and the replacement and migration step. Where the interface can warn at runtime, a CLI flag or environment variable prints one line to stderr; an MCP tool or input is marked deprecated in its description.
4. **Keep it working** for the full window. Only fixes and security changes are made to a deprecated interface, and its behavior must not drift toward the replacement.
5. **Remove it** in the first release after the window. The CHANGELOG entry says so, the docs stop describing it, and a versioned format's old file is retired together with runtime support for it. The issue is linked from the release notes.
6. **If the replacement is not ready**, extend the window in the table and say why in the issue. A deprecation without a documented replacement is not opened.

A security vulnerability, data corruption, or a contract that would make a lifecycle answer unsafe to act on may be fixed or removed in the next patch release. The release notes name the change, and a vulnerability is reported through [SECURITY.md](../SECURITY.md).

### What is not a deprecation

- **Lifecycle findings.** Rules and their evidence are data, not an interface. A data update can add, change, or remove a finding at any time; a [baseline](CAPABILITIES.md) or a pinned data version is how a project stabilizes its results. A new finding is not a breaking change.
- **Detector coverage and maturity.** Moving a detector between `Experimental`, `Beta`, and `Supported`, or reading a new declaration form, changes what a scan reports. [Decision 0013](decisions/0013-detector-maturity.md) governs those changes.
- **Bug fixes.** Correcting a wrong location, rule match, or message is not a deprecation, even when the corrected output differs from the old one.
- **Internals.** Modules that are not exported from `src/index.ts` or named in a schema, the `tools/` maintainer scripts, test fixtures, and plugin packaging internals may change at any time.

### Current deprecations

| Interface | Deprecated in | May be removed after | Replacement |
| --- | --- | --- | --- |
| None | — | — | — |

## Ecosystem coverage

<!-- coverage-matrix:start -->
| Detector ecosystem | Status | Coverage |
| --- | --- | --- |
| CI runner images | Supported | `pool.vmImage` in `azure-pipelines.yml` is matched against reviewed Azure hosted-image rules. GitLab `image` and `services` values are unclassified. CircleCI orbs, dynamic values, and floating aliases are unclassified; other CircleCI images are not judged. See [CI runner images](#ci-runner-images-detector). |
| Container base images | Supported | `FROM` lines in Dockerfiles and Containerfiles and `services.*.image` in Compose files, for Docker Hub official images with a vendor lifecycle. See [Container base images](detectors/container.md). |
| .NET | Supported | `global.json`, project files, `Directory.Build.props`, `Directory.Packages.props`, and `packages.lock.json`, for .NET release lines past end of support and deprecated NuGet packages. See [.NET](detectors/dotnet.md). |
| Go | Supported | `go` and `toolchain` directives in `go.mod` and `go.work`, and direct `require` entries, for Go release lines past end of support. See [Go](detectors/go.md). |
| Java and Kotlin (JVM) | Supported | JDK declarations in `pom.xml`, Gradle build scripts, `.java-version`, `.sdkmanrc`, and `.tool-versions`, and direct Maven dependencies, for non-LTS JDK releases past end of support and moved artifacts. See [Java and Kotlin](detectors/java.md). |
| Kubernetes APIs | Beta | The literal `apiVersion` and `kind` in YAML manifests, Helm chart templates, and kustomization patches, for API versions the Kubernetes project says are no longer served, and `Chart.yaml` dependencies that still point at the retired Helm stable or incubator repositories. See [Kubernetes APIs](detectors/kubernetes.md). |
| GitHub Actions | Supported | Selected first-party Action lifecycle rules and exact workflow locations. |
| Node.js and npm | Supported | Runtime declarations, direct dependencies, lockfiles, and supported source usages. |
| PHP | Supported | Pinned runtime declarations in `.php-version`, `.tool-versions`, `composer.json`, and `composer.lock`, for PHP release lines past end of support and abandoned Composer packages. See [PHP](#php-detector). |
| Python | Supported | Runtime declarations, direct dependencies, common lockfiles, and supported source usages. |
| Ruby | Supported | Pinned runtime declarations in `.ruby-version`, `.tool-versions`, the Gemfile `ruby` directive, and Gemfile.lock `RUBY VERSION`, plus direct gems, for Ruby release lines past end of support and yanked gems. Gem rules can list source usages in Ruby files. |
| Rust | Supported | The pinned toolchain in `rust-toolchain(.toml)` and direct dependencies in `Cargo.toml` and `Cargo.lock`, for toolchains older than the newest stable release and unmaintained crates. See [Rust](detectors/rust.md). |
| Swift | Supported | `.swift-version` and `.xcode-version` pins, the `swift-tools-version` line and literal `from:` / `exact:` dependencies in `Package.swift`, and resolved pin versions in `Package.resolved`, for Xcode releases App Store Connect no longer accepts and Swift toolchain lines with a lifecycle rule. The iOS deployment target (`IPHONEOS_DEPLOYMENT_TARGET`) of an application target in an `.xcodeproj` `project.pbxproj`, for iOS releases App Store Connect no longer accepts. Libraries and `platforms:` minimums in `Package.swift` are not read for it. See [Swift](detectors/swift.md). |
| Android | Experimental | Literal `compileSdk`, `minSdk`, `targetSdk`, and `buildToolsVersion` in `build.gradle` and `build.gradle.kts`, Android Gradle Plugin and Kotlin Android plugin versions in `settings.gradle(.kts)`, `agp` and `kotlin` keys in `libs.versions.toml`, and string-notation Maven dependencies, matched to reviewed rules. Bundled rules cover Google Play Billing Library majors 5 through 9. SDK and plugin declarations produce a finding only when a rule names them. See [Android](#android-detector). |
| C and C++ | Supported | `cmake_minimum_required`, C and C++ language standards, and compiler version checks in `CMakeLists.txt`; direct requirements in `conanfile.txt` and `conanfile.py`; and direct dependencies and `builtin-baseline` in `vcpkg.json`. Bundled rules cover CMake policy versions older than 3.5 (removed) and from 3.5 up to 3.10 (deprecated). See [C and C++](#c-and-c-detector). |
| Dart and Flutter | Experimental | Resolved packages and SDK constraints in `pubspec.lock`, direct dependencies and `environment` constraints in `pubspec.yaml`, and the Flutter version pinned in `.fvmrc` and `.fvm/fvm_config.json`, for Dart SDK releases past end of support and discontinued pub packages. See [Dart and Flutter](detectors/dart.md). |
| Deno and Bun | Experimental | Exact runtime pins in `deno.json`, `deno.jsonc`, `bunfig.toml`, and `.bun-version`, for Deno and Bun release lines past end of life. Version ranges, floating aliases, and environment variables are not matched. See [Deno and Bun](detectors/deno.md). |
| Database runtimes | Experimental | Image tags of `postgres`, `mysql`, `mariadb`, `redis`, and `mongo` services in Compose files, and literal engine versions on AWS (`engine` and `engine_version`), Azure (`version`), and Google Cloud SQL (`database_version`) managed database resources in `*.tf`, for major and minor lines past end of life or standard support. Bundled rules cover PostgreSQL 11 through 13 and MySQL 5.7 and 8.0, Azure Database for PostgreSQL 11 through 13 and MySQL 5.7, and Cloud SQL for PostgreSQL 9.6 through 13 and MySQL 5.6 and 5.7. Variables in Terraform version attributes are listed as unclassified. See [Database runtimes](detectors/database.md). |
| Elixir and Mix | Supported | Pinned Elixir and Erlang/OTP versions in `.tool-versions`, the project `elixir:` constraint and direct Hex deps in `mix.exs`, and resolved Hex packages in `mix.lock`, for Elixir and OTP release lines past end of support and retired Hex packages. See [Elixir and Mix](detectors/elixir.md). |
| Scala and sbt | Supported | Pinned Scala versions in `.scala-version` and literal `scalaVersion` settings in `build.sbt`, and `sbt.version` in `project/build.properties`, for Scala 2.11, frozen Scala 3.0–3.2 lines, and sbt 0.13. See [Scala and sbt](detectors/scala.md). |
| Shell and PowerShell | Supported | Literal `#Requires -Version` directives in `*.ps1` and `*.psm1`, `PowerShellVersion` in `*.psd1` manifests, and pinned `mcr.microsoft.com/powershell` image tags in `.github/workflows` files, for PowerShell releases past end of support. Bundled rules cover PowerShell 6.x and 7.0 through 7.3. Shell names such as `shell: pwsh` and Bash images carry no version and are not matched. See [Shell and PowerShell](detectors/shell.md). |
| Terraform | Experimental | `required_version` and `required_providers` constraints in `*.tf`, locked provider versions in `.terraform.lock.hcl`, the Terraform CLI version pinned in `.terraform-version` and `.tool-versions`, and managed Kubernetes control-plane versions in `*.tf` for Amazon EKS, Google Kubernetes Engine, and Azure Kubernetes Service, for Terraform CLI and Kubernetes release lines past end of support. Bundled rules cover CLI lines 1.10 through 1.14 and EKS, GKE, and AKS versions 1.33 and earlier; provider rules are not bundled yet. See [Terraform](detectors/terraform.md). |
| Serverless runtimes | Beta | `Runtime` on AWS SAM and CloudFormation functions and `Globals`, `provider.runtime` and per-function `runtime` in `serverless.yml`, and Terraform `runtime` on `aws_lambda_function` plus Google Cloud Functions runtimes and Azure function-app `application_stack` version pins. Bundled rules cover selected AWS Lambda and Google Cloud Functions identifiers that the vendors list as end-of-life. See [Serverless runtimes](detectors/serverless.md). |
| Other language and platform ecosystems | Unsupported | Report the limitation; do not infer lifecycle status without a detector. |
<!-- coverage-matrix:end -->

`Supported` means the combination is part of the documented product contract.
`Experimental` means it is usable but lacks a complete release gate or stable
distribution package. For detectors, `Experimental`, `Beta`, and `Supported`
have the meanings and the evidence requirements in
[decision 0013](decisions/0013-detector-maturity.md), and the level of each is
recorded in `benchmarks/thresholds.json`. `Unsupported` means Evergreen does not currently claim the
combination works.

## PHP detector

Moved to [PHP detector: PHP detector](compatibility/php.md#php-detector).

### Supported files and declarations

Moved to [PHP detector: Supported files and declarations](compatibility/php.md#supported-files-and-declarations).

### What it reports

Moved to [PHP detector: What it reports](compatibility/php.md#what-it-reports).

### What it intentionally does not judge

Moved to [PHP detector: What it intentionally does not judge](compatibility/php.md#what-it-intentionally-does-not-judge).

### Known limits and false-positive boundaries

Moved to [PHP detector: Known limits and false-positive boundaries](compatibility/php.md#known-limits-and-false-positive-boundaries).

## Ruby detector

Moved to [Ruby detector: Ruby detector](compatibility/ruby.md#ruby-detector).

### Supported files and declarations

Moved to [Ruby detector: Supported files and declarations](compatibility/ruby.md#supported-files-and-declarations).

### What it reports

Moved to [Ruby detector: What it reports](compatibility/ruby.md#what-it-reports).

### What it intentionally does not judge

Moved to [Ruby detector: What it intentionally does not judge](compatibility/ruby.md#what-it-intentionally-does-not-judge).

### Known limits and false-positive boundaries

Moved to [Ruby detector: Known limits and false-positive boundaries](compatibility/ruby.md#known-limits-and-false-positive-boundaries).

## Swift detector

The `swift` detector is **supported**: its level is recorded as `stable` in `benchmarks/thresholds.json`, and the precision floor is enforced. Eighty-five public repositories in [Validation](validation/ecosystems.md#swift-corpus) cover it. Supported forms, limits, and data sources are documented in [Swift](detectors/swift.md). Its lifecycle rules are in `registry/swift.json` and ship in the [data bundle](DATA.md).

## Dart and Flutter detector

The `dart` detector is **experimental**: its level is recorded as `experimental` in `benchmarks/thresholds.json`. Supported files, declaration forms, matching rules, and limits are documented in [Dart and Flutter](detectors/dart.md). Its lifecycle rules are in `registry/dart.json` and ship in the [data bundle](DATA.md).

## Elixir and Mix detector

The `elixir` detector is **supported**: its level is recorded as `stable` in `benchmarks/thresholds.json`. Supported files, declaration forms, matching rules, and limits are documented in [Elixir and Mix](detectors/elixir.md). Its lifecycle rules are in `registry/elixir.json` and ship with the package (see [Lifecycle data](DATA.md)).

## Scala and sbt detector

The `scala` detector is **stable**: its level is recorded as `stable` in `benchmarks/thresholds.json`, and the precision floor is enforced. Eighty public repositories in [Validation](validation/ecosystems.md#scala-and-sbt-corpus) cover it (blind-selected by the 2026-11-07 rule). Supported files, declaration forms, matching rules, and limits are documented in [Scala and sbt](detectors/scala.md). Its lifecycle rules are in `registry/scala.json` and ship with the package (see [Lifecycle data](DATA.md)).

## Database runtimes detector

The `database` detector is **experimental**: its level is recorded as `experimental` in `benchmarks/thresholds.json`. Five public repositories are pinned in `benchmarks/public-repositories/`: four targeted cases and one blind, zero-finding repository, with ground truth from the vendors' lifecycle sources. Supported files, declaration forms, matching rules, and limits are documented in [Database runtimes](detectors/database.md). Its lifecycle rules are in `registry/database.json` and ship in the [data bundle](DATA.md).

## Shell and PowerShell detector

The `shell` detector is **supported**: its level is recorded as `stable` in `benchmarks/thresholds.json`. Forty-three public repositories are pinned under the `shell` ecosystem, thirty-nine of them chosen blind, with nine zero-finding controls. Each expected finding was checked by reading its line at the pinned commit against Microsoft's PowerShell support lifecycle, independently of Evergreen output. Supported files, declaration forms, matching rules, and limits are documented in [Shell and PowerShell](detectors/shell.md). Its lifecycle rules are in `registry/shell.json` and ship in the [data bundle](DATA.md).

## Terraform detector

The `terraform` detector is **experimental**: its level is recorded as `experimental` in `benchmarks/thresholds.json`. Supported files, declaration forms, matching rules, and limits are documented in [Terraform](detectors/terraform.md). Its lifecycle rules are in `registry/terraform.json` and ship in the [data bundle](DATA.md).

### Managed Kubernetes

| Product | Declaration read | Notes |
| --- | --- | --- |
| Amazon EKS | `cluster_version` and `kubernetes_version` in a module whose `source` is `terraform-aws-modules/eks/aws` | The module renamed `cluster_version` to `kubernetes_version` in v21; the source, not the attribute name, decides the vendor. |
| Google Kubernetes Engine | `min_master_version` on `google_container_cluster`, or `kubernetes_version` and `min_master_version` in a module whose `source` is `terraform-google-modules/kubernetes-engine/google` | A `//submodule` path and a `?ref=` suffix are accepted. |
| Azure Kubernetes Service | `kubernetes_version` on `azurerm_kubernetes_cluster`, or `kubernetes_version` in a module whose `source` is `Azure/aks/azurerm` | A module with an unknown source has its version attributes reported as unclassified. |

## C and C++ detector

Moved to [C and C++ detector: C and C++ detector](compatibility/cpp.md#c-and-c-detector).

### Supported files and declarations

Moved to [C and C++ detector: Supported files and declarations](compatibility/cpp.md#supported-files-and-declarations).

### Package URLs

Moved to [C and C++ detector: Package URLs](compatibility/cpp.md#package-urls).

### What it reports

Moved to [C and C++ detector: What it reports](compatibility/cpp.md#what-it-reports).

### What it intentionally does not judge

Moved to [C and C++ detector: What it intentionally does not judge](compatibility/cpp.md#what-it-intentionally-does-not-judge).

### Known limits and false-positive boundaries

Moved to [C and C++ detector: Known limits and false-positive boundaries](compatibility/cpp.md#known-limits-and-false-positive-boundaries).

## Serverless runtimes detector

The `serverless` detector is **beta**: its level is recorded as `beta` in `benchmarks/thresholds.json`, and the precision floor is enforced. Ten public repositories in [Validation](validation/ecosystems.md#serverless-corpus) cover it (five targeted, five blind). Supported forms, limits, and data sources are documented in [Serverless runtimes](detectors/serverless.md). Its lifecycle rules are in `registry/serverless.json` and ship in the [data bundle](DATA.md).

## Android detector

Moved to [Android detector: Android detector](compatibility/android.md#android-detector).

### Supported files and declarations

Moved to [Android detector: Supported files and declarations](compatibility/android.md#supported-files-and-declarations).

### Package URLs

Moved to [Android detector: Package URLs](compatibility/android.md#package-urls).

### What it reports

Moved to [Android detector: What it reports](compatibility/android.md#what-it-reports).

### What it intentionally does not judge

Moved to [Android detector: What it intentionally does not judge](compatibility/android.md#what-it-intentionally-does-not-judge).

### Known limits and false-positive boundaries

Moved to [Android detector: Known limits and false-positive boundaries](compatibility/android.md#known-limits-and-false-positive-boundaries).

## CI runner images detector

Moved to [CI runner images detector: CI runner images detector](compatibility/ci-runner-images.md#ci-runner-images-detector).

### Supported files and declarations

Moved to [CI runner images detector: Supported files and declarations](compatibility/ci-runner-images.md#supported-files-and-declarations).

### What it reports

Moved to [CI runner images detector: What it reports](compatibility/ci-runner-images.md#what-it-reports).

### What it intentionally does not judge

Moved to [CI runner images detector: What it intentionally does not judge](compatibility/ci-runner-images.md#what-it-intentionally-does-not-judge).

### Known limits and false-positive boundaries

Moved to [CI runner images detector: Known limits and false-positive boundaries](compatibility/ci-runner-images.md#known-limits-and-false-positive-boundaries).

## Monorepos

The npm and Python detectors read every package of a workspace, not only the repository root. Packages are found from the declarations the package managers use: `workspaces` in `package.json` (npm and Yarn, array or `packages` form), `pnpm-workspace.yaml` (with `!` exclusions), `lerna.json`, and `[tool.uv.workspace]` `members` and `exclude` in `pyproject.toml`. Globs support `*`, `?`, and `**`.

- Findings name the package's own file, for example `packages/a/package.json`, and carry the usages inside that package's directory; usages outside every package stay with the root.
- A workspace without its own lockfile resolves versions against the root's lockfile.
- Discovery is bounded: eight directory levels, 500 packages, symbolic links never followed, and `node_modules`, `vendor`, `dist`, `build`, `target`, virtual environments, and fixture directories skipped.
- A malformed workspace manifest is skipped, so one bad package does not hide the others. A malformed root `package.json` is still an error.
- Without a workspace declaration only the root is scanned, as before. Python projects that are not uv workspaces (for example separate `pyproject.toml` files under `services/`) are not discovered.

## CI behavior

- In GitHub Actions, the doctor requires `GITHUB_WORKSPACE` to name an accessible
  checkout directory.
- In GitLab CI, the doctor requires `CI_PROJECT_DIR` to name an accessible checkout
  directory.
- Outside those environments, it reports local execution and does not require CI
  variables.

The checks only read Evergreen's own packaged metadata and test workspace
accessibility. They do not inspect secrets, tokens, repository contents, or remote
services.
