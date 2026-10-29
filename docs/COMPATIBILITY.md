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
| CI runner images | Experimental | `pool.vmImage` in `azure-pipelines.yml` is matched against reviewed Azure hosted-image rules. GitLab `image` and `services` values are unclassified. CircleCI orbs, dynamic values, and floating aliases are unclassified; other CircleCI images are not judged. See [CI runner images](#ci-runner-images-detector). |
| Container base images | Experimental | `FROM` lines in Dockerfiles and Containerfiles and `services.*.image` in Compose files, for Docker Hub official images with a vendor lifecycle. See [Container base images](detectors/container.md). |
| .NET | Beta | `global.json`, project files, `Directory.Build.props`, `Directory.Packages.props`, and `packages.lock.json`, for .NET release lines past end of support and deprecated NuGet packages. See [.NET](detectors/dotnet.md). |
| Go | Experimental | `go` and `toolchain` directives in `go.mod` and `go.work`, and direct `require` entries, for Go release lines past end of support. See [Go](detectors/go.md). |
| Java and Kotlin (JVM) | Beta | JDK declarations in `pom.xml`, Gradle build scripts, `.java-version`, `.sdkmanrc`, and `.tool-versions`, and direct Maven dependencies, for non-LTS JDK releases past end of support and moved artifacts. See [Java and Kotlin](detectors/java.md). |
| Kubernetes APIs | Beta | The literal `apiVersion` and `kind` in YAML manifests, Helm chart templates, and kustomization patches, for API versions the Kubernetes project says are no longer served, and `Chart.yaml` dependencies that still point at the retired Helm stable or incubator repositories. See [Kubernetes APIs](detectors/kubernetes.md). |
| GitHub Actions | Supported | Selected first-party Action lifecycle rules and exact workflow locations. |
| Node.js and npm | Supported | Runtime declarations, direct dependencies, lockfiles, and supported source usages. |
| PHP | Experimental | Pinned runtime declarations in `.php-version`, `.tool-versions`, `composer.json`, and `composer.lock`, for PHP release lines past end of support and abandoned Composer packages. See [PHP](#php-detector). |
| Python | Supported | Runtime declarations, direct dependencies, common lockfiles, and supported source usages. |
| Ruby | Experimental | Pinned runtime declarations in `.ruby-version`, `.tool-versions`, the Gemfile `ruby` directive, and Gemfile.lock `RUBY VERSION`, plus direct gems, for Ruby release lines past end of support and yanked gems. Gem rules can list source usages in Ruby files. |
| Rust | Experimental | The pinned toolchain in `rust-toolchain(.toml)` and direct dependencies in `Cargo.toml` and `Cargo.lock`, for toolchains older than the newest stable release and unmaintained crates. See [Rust](detectors/rust.md). |
| Swift | Beta | `.swift-version` and `.xcode-version` pins, the `swift-tools-version` line and literal `from:` / `exact:` dependencies in `Package.swift`, and resolved pin versions in `Package.resolved`, for Xcode releases App Store Connect no longer accepts and Swift toolchain lines with a lifecycle rule. The iOS deployment target (`IPHONEOS_DEPLOYMENT_TARGET`) of an application target in an `.xcodeproj` `project.pbxproj`, for iOS releases App Store Connect no longer accepts. Libraries and `platforms:` minimums in `Package.swift` are not read for it. See [Swift](detectors/swift.md). |
| Android | Experimental | Literal `compileSdk`, `minSdk`, `targetSdk`, and `buildToolsVersion` in `build.gradle` and `build.gradle.kts`, Android Gradle Plugin and Kotlin Android plugin versions in `settings.gradle(.kts)`, `agp` and `kotlin` keys in `libs.versions.toml`, and string-notation Maven dependencies, matched to reviewed rules. Bundled rules cover Google Play Billing Library majors 5 through 9. SDK and plugin declarations produce a finding only when a rule names them. See [Android](#android-detector). |
| C and C++ | Experimental | `cmake_minimum_required`, C and C++ language standards, and compiler version checks in `CMakeLists.txt`; direct requirements in `conanfile.txt` and `conanfile.py`; and direct dependencies and `builtin-baseline` in `vcpkg.json`. Bundled rules cover CMake policy versions older than 3.5 (removed) and from 3.5 up to 3.10 (deprecated). See [C and C++](#c-and-c-detector). |
| Dart and Flutter | Experimental | Resolved packages and SDK constraints in `pubspec.lock`, direct dependencies and `environment` constraints in `pubspec.yaml`, and the Flutter version pinned in `.fvmrc` and `.fvm/fvm_config.json`, for Dart SDK releases past end of support and discontinued pub packages. See [Dart and Flutter](detectors/dart.md). |
| Deno and Bun | Experimental | Exact runtime pins in `deno.json`, `deno.jsonc`, `bunfig.toml`, and `.bun-version`, for Deno and Bun release lines past end of life. Version ranges, floating aliases, and environment variables are not matched. See [Deno and Bun](detectors/deno.md). |
| Database runtimes | Experimental | Image tags of `postgres`, `mysql`, `mariadb`, `redis`, and `mongo` services in Compose files, and literal engine versions on AWS (`engine` and `engine_version`), Azure (`version`), and Google Cloud SQL (`database_version`) managed database resources in `*.tf`, for major and minor lines past end of life or standard support. Bundled rules cover PostgreSQL 11 through 13 and MySQL 5.7 and 8.0, Azure Database for PostgreSQL 11 through 13 and MySQL 5.7, and Cloud SQL for PostgreSQL 9.6 through 13 and MySQL 5.6 and 5.7. Variables in Terraform version attributes are listed as unclassified. See [Database runtimes](detectors/database.md). |
| Elixir and Mix | Experimental | Pinned Elixir and Erlang/OTP versions in `.tool-versions`, the project `elixir:` constraint and direct Hex deps in `mix.exs`, and resolved Hex packages in `mix.lock`, for Elixir and OTP release lines past end of support and retired Hex packages. See [Elixir and Mix](detectors/elixir.md). |
| Scala and sbt | Experimental | Pinned Scala versions in `.scala-version` and literal `scalaVersion` settings in `build.sbt`, and `sbt.version` in `project/build.properties`, for Scala 2.11, frozen Scala 3.0–3.2 lines, and sbt 0.13. See [Scala and sbt](detectors/scala.md). |
| Shell and PowerShell | Experimental | Literal `#Requires -Version` directives in `*.ps1` and `*.psm1`, `PowerShellVersion` in `*.psd1` manifests, and pinned `mcr.microsoft.com/powershell` image tags in `.github/workflows` files, for PowerShell releases past end of support. Bundled rules cover PowerShell 6.x and 7.0 through 7.3. Shell names such as `shell: pwsh` and Bash images carry no version and are not matched. See [Shell and PowerShell](detectors/shell.md). |
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

The `php` detector is **experimental**: its level is recorded as `experimental` in `benchmarks/thresholds.json`. Five public repositories in [Validation](VALIDATION.md#php-corpus) cover it. Its lifecycle rules are in `registry/php.json` and ship in the [data bundle](DATA.md).

### Supported files and declarations

| File | Declaration read | Notes |
| --- | --- | --- |
| `.php-version` | One pinned version on a line by itself, such as `7.4.33`, `7.4`, or `php-7.4.33` | Blank lines and `#` comments are ignored. A file with more than one version, or any other line, produces nothing. The `php-` prefix is stripped before matching. |
| `.tool-versions` | A `php` line with one or more pinned versions | Every version on the line is reported. Other tools are ignored. A line with any unsupported token produces nothing. |
| `composer.json` | `require.php`, `config.platform.php`, and direct packages in `require` / `require-dev` (`vendor/name` with a literal constraint) | Extensions (`ext-*`), floating `*`, dynamic `${…}` values, `extra.php`, and other `config.platform.*` keys are ignored. |
| `composer.lock` | `platform.php`, and each resolved package in `packages` / `packages-dev` (`name` and `version`) | Every resolved package is checked, including transitive and `require-dev` packages. `platform-dev`, `plugin-api-version`, and non-`php` platform keys are not read. An `abandoned` flag is parsed and is not a finding by itself. |

Files are found by walking the repository up to eight directories deep, to at most 500 files. Symbolic links are not followed, and `.git`, `node_modules`, `vendor`, `dist`, `build`, `target`, `.venv`, `venv`, `fixtures`, `__fixtures__`, and `testdata` are skipped. PHP, phpenv, asdf, and Composer are never run, and nothing is fetched.

### What it reports

- A pinned PHP release line that is past end of life, in the `.php-version`, `.tool-versions`, `composer.json` `config.platform.php`, or `composer.lock` `platform.php` line that pins it, or an exact `require.php` version that matches a rule. The bundled rules cover PHP 8.1, 8.0, and 7.4, citing the [PHP unsupported branches](https://www.php.net/eol.php) page. A requirement range such as `>=7.4` or `^8.2` is not a pin and produces no runtime finding.
- A `composer.json` package line only when a rule covers every version of that package (`vers:composer/*`). The bundled abandoned-package rules cover `swiftmailer/swiftmailer` and `zendframework/zend-stdlib`, citing Packagist and the Symfony / Laminas announcements.
- A resolved package in `composer.lock` when a rule's `vers` contains that version. Abandoned-package rules match any resolved version of the named package.

Each finding names the file and line, and carries its rule's source, replacement, deadline, migration guidance, and verification commands. A package finding whose rule lists usage matchers also lists the `.php` files that `require` / `include` (and `_once`) that package, and the qualified calls those matchers name (`Class::method` and `new Class`). The finding's impact counts those usages, and a migration packet lists the files. A runtime finding points at the pin only.

### What it intentionally does not judge

- PHP releases and Composer packages with no rule in `registry/php.json`. A missing finding is not evidence that a version is current.
- A `.php-version` or `.tool-versions` value of `system` or `latest`, a template, or a value that interpolates at runtime.
- Composer `require.php` constraints that are not concrete versions (`>=7.4`, `^8.2`, `~8.1.0`, and similar ranges).
- Extensions (`ext-*`), floating `*` package constraints, `git` / `path` repositories, and dynamic `${…}` values in `composer.json`.
- An `abandoned` flag in `composer.lock` without a matching lifecycle rule. Composer may mark a package abandoned; Evergreen reports it only when a reviewed rule names that package.
- Vulnerability advisories and license policy.

### Known limits and false-positive boundaries

- A runtime pin is reported whatever the project actually runs. A stale `.tool-versions` or `config.platform.php` that a project no longer uses still produces a finding.
- `composer.lock` findings include transitive packages, because the lockfile resolves them. A package can be reported even though the project never imports it.
- Package names are matched exactly as written in the file, and a rule matches only the versions its `vers` range names.
- Malformed input produces no declarations from the affected unit, never a partial result, and no error is raised. For `.php-version`, `composer.json`, and `composer.lock` that unit is the whole file. For `.tool-versions` it is the one malformed line. A file over 1 MiB yields nothing, and a single line over 4,096 characters is skipped.
- The eight-level and 500-file limits are silent. Files beyond them, and any under `vendor` or a skipped directory, are not scanned.
- Source usage reads `.php` files. Quoted `require` / `include` (and `_once`) paths match a rule whose module is that path (a trailing `.php` is stripped). A call matches when the rule names the qualified form, such as `Swift_Mailer::newInstance` or `new Zend\Stdlib\Parameters`. Usage is not a PHP AST: it is regex-based matching, so unusual formatting can miss a call or require.
- A `require` or `include` whose argument is not a string literal (a variable, concatenation, or a method call on the string) is listed as unclassified, with its file and line. Evergreen does not guess which package it loads. `new $class` and `$class::method()` are unclassified for the same reason.
- Usage is not read under `vendor`, `fixtures`, `__fixtures__`, or `testdata`. Comments and ordinary strings are not usages. A single source line over 4,096 characters is skipped for usage scanning, matching the declaration parsers.

## Ruby detector

The `ruby` detector is **experimental**: its level is recorded as `experimental` in `benchmarks/thresholds.json`. Five public repositories in [Validation](VALIDATION.md#ruby-corpus) cover it. Its lifecycle rules are in `registry/ruby.json` and ship in the [data bundle](DATA.md).

### Supported files and declarations

| File | Declaration read | Notes |
| --- | --- | --- |
| `.ruby-version` | One pinned version on a line by itself, such as `3.2.2`, `3.2`, `3.2.2p53`, or `ruby-3.2.2` | Blank lines and `#` comments are ignored. A file with more than one version, or any other line, produces nothing. |
| `.tool-versions` | A `ruby` line with one or more pinned versions | Every version on the line is reported. Other tools are ignored. A line with any unsupported token produces nothing. |
| `Gemfile` | The `ruby "3.2.2"` directive, and `gem "name", "version"` with a literal version | A `gem` line with a `git:` or `path:` option is skipped. Only the first literal version on a `gem` line is read. |
| `Gemfile.lock` | The `RUBY VERSION` line, and each resolved gem in the `GEM` section's `specs:` (`name (version)`) | Every resolved gem is checked, including transitive gems. `DEPENDENCIES`, `BUNDLED WITH`, and `GIT` and `PATH` specs are not read. |

Files are found by walking the repository up to eight directories deep, to at most 500 files. Symbolic links are not followed, and `.git`, `node_modules`, `vendor`, `dist`, `build`, `target`, `.venv`, `venv`, `fixtures`, `__fixtures__`, and `testdata` are skipped. Ruby, rbenv, asdf, and Bundler are never run, and nothing is fetched.

### What it reports

- A pinned Ruby release line that is past end of life, in the `.ruby-version`, `.tool-versions`, or `Gemfile` line that pins it, or the `Gemfile.lock` `RUBY VERSION` line. The bundled rules cover Ruby 3.2, 3.1, 3.0, and 2.7, citing the [Ruby maintenance branches](https://www.ruby-lang.org/en/downloads/branches/) page.
- A resolved gem in `Gemfile.lock` that a rule covers. The bundled gem rule covers `json` 2.17.1.1 (yanked), citing its [RubyGems version page](https://rubygems.org/gems/json/versions/2.17.1.1).
- A `Gemfile` gem line is reported only by a rule that covers every version of the gem. The bundled gem rule covers one version, so a `Gemfile` gem line alone produces no finding today.

Each finding names the file and line, and carries its rule's source, replacement, deadline, migration guidance, and verification commands. A gem finding whose rule lists usage matchers also lists the `.rb`, `.rake`, and `.ru` files that `require`, `load`, `gem`, or `autoload` that gem, and the qualified calls those matchers name (including a constant or variable assigned from that constant). The finding's impact counts those usages, and a migration packet lists the files. A runtime finding points at the pin only.

### What it intentionally does not judge

- Ruby releases and gems with no rule in `registry/ruby.json`. A missing finding is not evidence that a version is current.
- A `.ruby-version` or `.tool-versions` value of `system` or `latest`, a template, or a value that interpolates at runtime.
- Gemfile `ruby` directives with options or a requirement range, such as `ruby ">= 3.0"`.
- Dependencies declared with no version, `git` or `path` gems, `eval_gemfile`, `gemspec`, or a dynamic value (`ENV[...]`, `#{...}`, `${...}`).
- `required_ruby_version` in a `*.gemspec`. A parser for it exists, but the detector does not read gemspec files yet, so a gemspec never produces a finding.
- Vulnerability advisories and license policy.

### Known limits and false-positive boundaries

- A runtime pin is reported whatever the project actually runs. A stale `.tool-versions` that a project no longer uses still produces a finding.
- `Gemfile.lock` findings include transitive gems, because the lockfile resolves them. A gem can be reported even though the project never imports it.
- Gem names are matched exactly as written in the file, and a rule matches only the versions its `vers` range names.
- A Bundler platform suffix in a lock version (such as `1.15.4-x86_64-linux`) is kept as written and compared as written.
- Malformed input produces no declarations from the affected unit, never a partial result, and no error is raised. For `.ruby-version`, `Gemfile`, and `Gemfile.lock` that unit is the whole file: an unterminated string in a `Gemfile`, a truncated spec in `Gemfile.lock`, or an unsupported line in `.ruby-version` yields nothing from that file. For `.tool-versions` it is the one malformed line. A file over 1 MiB yields nothing, and a single line over 4,096 characters is skipped.
- The eight-level and 500-file limits are silent. Files beyond them, and any under `vendor` or a skipped directory, are not scanned.
- Source usage reads `.rb`, `.rake`, and `.ru` files. `require "json"`, `require "json/ext"`, `load "json.rb"`, `gem "json"`, `autoload :JSON, "json"`, and `Kernel.require "json"` match a rule whose module is `json`. `require_relative` of a literal is a local file and is not a gem import. A call matches when the rule names the qualified form, such as `JSON.parse`, and the source calls it with parentheses (`JSON.parse(` or `JSON::parse(`). `Parser = JSON` or `parser = ::JSON`, and an alias of that alias, counts as the same call. A call without parentheses is not matched.
- A `require`, `load`, `gem`, or `autoload` whose argument is not a string literal (a variable, interpolation, concatenation, or a method call on the string) is listed as unclassified, with its file and line. Evergreen does not guess which gem it loads. `require_relative` is never unclassified: it always names a local file. A local variable or hash key named `require`/`load`/`gem`, or a bare `load` with no argument, is not a call.
- Alias assignments are capped per file; deep or cyclic alias chains resolve to nothing. A single source line over 4,096 characters is skipped for usage scanning, matching the declaration parsers.
- Usage is not read under `vendor`, `fixtures`, `__fixtures__`, or `testdata`. Comments, ordinary strings, percent literals, heredocs, and `=begin`/`=end` blocks are not usages. A method receiver such as `JSON.load` is a call only when a matcher names it, not a file `load`.

## Swift detector

The `swift` detector is **beta**: its level is recorded as `beta` in `benchmarks/thresholds.json`, and the precision floor is enforced. Thirteen public repositories in [Validation](VALIDATION.md#swift-corpus) cover it (six targeted, seven blind). Supported forms, limits, and data sources are documented in [Swift](detectors/swift.md). Its lifecycle rules are in `registry/swift.json` and ship in the [data bundle](DATA.md).

## Dart and Flutter detector

The `dart` detector is **experimental**: its level is recorded as `experimental` in `benchmarks/thresholds.json`. Supported files, declaration forms, matching rules, and limits are documented in [Dart and Flutter](detectors/dart.md). Its lifecycle rules are in `registry/dart.json` and ship in the [data bundle](DATA.md).

## Elixir and Mix detector

The `elixir` detector is **experimental**: its level is recorded as `experimental` in `benchmarks/thresholds.json`. Supported files, declaration forms, matching rules, and limits are documented in [Elixir and Mix](detectors/elixir.md). Its lifecycle rules are in `registry/elixir.json` and ship with the package (see [Lifecycle data](DATA.md)).

## Scala and sbt detector

The `scala` detector is **experimental**: its level is recorded as `experimental` in `benchmarks/thresholds.json`. Supported files, declaration forms, matching rules, and limits are documented in [Scala and sbt](detectors/scala.md). Its lifecycle rules are in `registry/scala.json` and ship with the package (see [Lifecycle data](DATA.md)).

## Database runtimes detector

The `database` detector is **experimental**: its level is recorded as `experimental` in `benchmarks/thresholds.json`. Five public repositories are pinned in `benchmarks/public-repositories.json`: four targeted cases and one blind, zero-finding repository, with ground truth from the vendors' lifecycle sources. Supported files, declaration forms, matching rules, and limits are documented in [Database runtimes](detectors/database.md). Its lifecycle rules are in `registry/database.json` and ship in the [data bundle](DATA.md).

## Shell and PowerShell detector

The `shell` detector is **experimental**: its level is recorded as `experimental` in `benchmarks/thresholds.json`. Five public repositories are pinned in `benchmarks/public-repositories.json`: four targeted cases and one blind, zero-finding repository. Each expected finding was checked by reading its line at the pinned commit against Microsoft's PowerShell support lifecycle, independently of Evergreen output. Supported files, declaration forms, matching rules, and limits are documented in [Shell and PowerShell](detectors/shell.md). Its lifecycle rules are in `registry/shell.json` and ship in the [data bundle](DATA.md).

## Terraform detector

The `terraform` detector is **experimental**: its level is recorded as `experimental` in `benchmarks/thresholds.json`. Supported files, declaration forms, matching rules, and limits are documented in [Terraform](detectors/terraform.md). Its lifecycle rules are in `registry/terraform.json` and ship in the [data bundle](DATA.md).

### Managed Kubernetes

| Product | Declaration read | Notes |
| --- | --- | --- |
| Amazon EKS | `cluster_version` and `kubernetes_version` in a module whose `source` is `terraform-aws-modules/eks/aws` | The module renamed `cluster_version` to `kubernetes_version` in v21; the source, not the attribute name, decides the vendor. |
| Google Kubernetes Engine | `min_master_version` on `google_container_cluster`, or `kubernetes_version` and `min_master_version` in a module whose `source` is `terraform-google-modules/kubernetes-engine/google` | A `//submodule` path and a `?ref=` suffix are accepted. |
| Azure Kubernetes Service | `kubernetes_version` on `azurerm_kubernetes_cluster`, or `kubernetes_version` in a module whose `source` is `Azure/aks/azurerm` | A module with an unknown source has its version attributes reported as unclassified. |

## C and C++ detector

The `cpp` detector is **experimental**: its level is recorded as `experimental` in `benchmarks/thresholds.json`. Five public repositories are pinned in `benchmarks/public-repositories.json`: four targeted migration cases and one blind, zero-finding repository. Their ground truth cites maintainer migration commits or upstream release notes, independently of Evergreen output. Precision on this corpus does not establish coverage of unsupported declaration forms. Its lifecycle rules are in `registry/cpp.json` and ship in the [data bundle](DATA.md).

### Supported files and declarations

| File | Declaration read | Notes |
| --- | --- | --- |
| `CMakeLists.txt` | `cmake_minimum_required(VERSION <version>)`, `set(CMAKE_C_STANDARD <integer>)`, `set(CMAKE_CXX_STANDARD <integer>)`, and an `if` that names `CMAKE_<LANG>_COMPILER_ID` with `STREQUAL` and `CMAKE_<LANG>_COMPILER_VERSION` with a `VERSION_*` comparison | Values built at configure time, the policy-range form (`3.16...3.27`), `CACHE` / `PARENT_SCOPE` / `FORCE`, and checks combined with `OR` or `NOT` are ignored. |
| `conanfile.txt` | Each entry of the `[requires]` section, `name/version` | `@user/channel` and `#revision` are not versions. Other sections, including `[tool_requires]`, are ignored. Version ranges are ignored. |
| `conanfile.py` | The `requires` attribute and literal `self.requires(...)` calls | The file is untrusted Python and is never executed. f-strings, variables, and calls that span lines are ignored. `tool_requires` is not a direct requirement. |
| `vcpkg.json` | Top-level `builtin-baseline`, and each direct `dependencies` entry | A string dependency is a name. An object may also carry `version>=`. Feature-scoped dependencies, `overrides`, and the manifest's own `version` are ignored. |

Files are found by walking the repository up to eight directories deep, to at most 500 files. Symbolic links are not followed, and `.git`, `node_modules`, `vendor`, `dist`, `build`, `target`, `.venv`, `venv`, `fixtures`, `__fixtures__`, and `testdata` are skipped. CMake, Conan, and vcpkg are never run, and nothing is fetched.

### Package URLs

`pkg:generic/cmake` is the identity the CMake policy importer writes. `conan` is the Package URL type, so a requirement is `pkg:conan/<name>` with the name as written. vcpkg has no importer yet, so a dependency is `pkg:vcpkg/<name>`. The other declarations are not packages: `pkg:generic/c-standard` and `pkg:generic/cxx-standard` for language standards, `pkg:generic/c-compiler/<id>` and `pkg:generic/cxx-compiler/<id>` for a compiler check (the compiler id is lowercased), and `pkg:generic/vcpkg-baseline` for a baseline commit.

### What it reports

- A `cmake_minimum_required` version that a `pkg:generic/cmake` rule contains. The bundled rules cover policy versions older than 3.5 (removed in CMake 4.0) and from 3.5 up to 3.10 (deprecated in CMake 3.31).
- A Conan requirement, a vcpkg `version>=` floor, a language standard, or a compiler comparison when a rule for that Package URL contains the version as written. There are no bundled rules for those yet.
- A vcpkg dependency with no `version>=`, only when a rule covers every version of that package.
- A `builtin-baseline` commit when a rule's range contains that string. A semver range does not contain a commit. A rule that covers every version does.

The first matching rule wins. A rule whose VERS is malformed, or whose comparison throws, is skipped and does not hide a later rule. Each finding names the file and line, and carries its rule's source, replacement, deadline, migration guidance, and verification commands.

### What it intentionally does not judge

- CMake generators and modules. The registry has rules for the Visual Studio 12 2013 generator, FindGDAL, and CMakeFindFrameworks, and the parser does not emit those declarations yet, so they produce no finding.
- Conan and vcpkg packages, language standards, compilers, and baselines with no rule. A missing finding is not evidence that a version is current.
- `cmake_minimum_required` written as a policy range (`VERSION 3.5...3.16`), a value read from a variable, or a generator expression.
- Conan `[tool_requires]` and `[build_requires]`, version ranges, and dynamic Python.
- Feature-scoped vcpkg dependencies and `overrides`.
- Vulnerability advisories and license policy.

### Known limits and false-positive boundaries

- A `version>=` floor is matched as that version, not as every version the constraint allows. A floor inside a rule is reported even when a newer resolution would sit outside it.
- A compiler check matches the compared version. `VERSION_LESS 9.3` is not read as "this project rejects compilers older than 9.3."
- A baseline commit matches a rule that covers every version, because that range does not inspect the commit.
- Malformed input produces no declarations from that file, never a partial result, and no error is raised. A file over 1 MiB yields nothing, and a single line over 4,096 characters is skipped.
- The eight-level and 500-file limits are silent. Files beyond them, and any under `build`, `vendor`, or another skipped directory, are not scanned.

## Serverless runtimes detector

The `serverless` detector is **beta**: its level is recorded as `beta` in `benchmarks/thresholds.json`, and the precision floor is enforced. Ten public repositories in [Validation](VALIDATION.md#serverless-corpus) cover it (five targeted, five blind). Supported forms, limits, and data sources are documented in [Serverless runtimes](detectors/serverless.md). Its lifecycle rules are in `registry/serverless.json` and ship in the [data bundle](DATA.md).

## Android detector

The `android` detector is **experimental**: its level is recorded as `experimental` in `benchmarks/thresholds.json`. Five public repositories are pinned for it in `benchmarks/public-repositories.json` (four targeted, one blind). Its lifecycle rules are in `registry/android.json` and ship in the [data bundle](DATA.md). The bundled rules cover Google Play Billing Library majors 5 through 9 and cite the [Google Play Billing Library version deprecation](https://developer.android.com/google/play/billing/deprecation-faq) timeline. Scans read that bundled registry only.

### Supported files and declarations

| File | Declaration read | Notes |
| --- | --- | --- |
| `build.gradle`, `build.gradle.kts` | Literal `compileSdk`, `minSdk`, `targetSdk`, and `buildToolsVersion` inside an `android { }` block, including `defaultConfig`, product flavors, and build types | An API level is a bare or quoted integer (`34`, `"34"`, `= 34`). `buildToolsVersion` is a quoted dotted number (`"34.0.0"`). |
| `build.gradle`, `build.gradle.kts` | A string-notation Maven coordinate on `implementation`, `api`, `compileOnly`, `runtimeOnly`, `testImplementation`, `testRuntimeOnly`, `testCompileOnly`, `annotationProcessor`, `kapt`, `ksp`, `compile`, `runtime`, or `testCompile` | The form is `implementation("group:artifact:version")`, with or without the parentheses. An optional classifier or `@` packaging suffix is not part of the version. |
| `settings.gradle`, `settings.gradle.kts` | A literal `id(...) version "..."` pin (Groovy quotes work too) for `com.android.application`, `com.android.library`, or `org.jetbrains.kotlin.android` | `apply false` still counts. The pin is read wherever it appears in the file. |
| `libs.versions.toml` | `agp` and `kotlin` keys in the `[versions]` table, each a quoted literal version | The file is found by that name at any depth, including `gradle/libs.versions.toml`. |

Files are found by walking the repository up to eight directories deep, to at most 2,000 of these files. Symbolic links are not followed, and `.git`, `node_modules`, `vendor`, `dist`, `build`, `target`, `.gradle`, `.venv`, `venv`, `fixtures`, `__fixtures__`, and `testdata` are skipped. Gradle is never run, and nothing is fetched.

### Package URLs

A string-notation dependency `group:artifact:version` is `pkg:maven/<group>/<artifact>`. An SDK setting is `pkg:generic/android/compileSdk`, `pkg:generic/android/minSdk`, `pkg:generic/android/targetSdk`, or `pkg:generic/android/buildToolsVersion`. An Android Gradle Plugin pin, in settings or the catalog `agp` key, is `pkg:generic/android/agp`. `org.jetbrains.kotlin.android` in settings is `pkg:generic/android/kotlin-android`. The catalog `kotlin` key is `pkg:generic/android/kotlin`, a different identity from the settings plugin.

### What it reports

- A string-notation `com.android.billingclient:billing` version that a bundled rule contains. The rules cover majors 5, 6, 7, 8, and 9.
- An SDK level, Android Gradle Plugin version, Kotlin Android plugin version, or catalog `agp` / `kotlin` pin when a rule for that Package URL contains the version text. No such rules are bundled, so those declarations produce no finding today.

The first matching rule wins. A rule whose VERS is malformed, or whose comparison throws, is skipped and does not hide a later rule. Each finding names the file and line, and carries its rule's source, replacement, deadline, migration guidance, and verification commands. A rule that lists usage matchers also lists `.java` and `.kt` usages. The bundled Play Billing rules do not list matchers, so those findings point at the declaration only.

### What it intentionally does not judge

- SDK levels, plugin versions, catalog pins, and Maven coordinates with no rule in `registry/android.json`. A missing finding is not evidence that a version meets Google Play's target API requirement or that a dependency is current.
- JDK pins in the same Gradle file (`sourceCompatibility`, `targetCompatibility`, `jvmToolchain`, `JavaLanguageVersion`). The Java and Kotlin detector reads those.
- Legacy names `compileSdkVersion`, `minSdkVersion`, and `targetSdkVersion`, method calls such as `compileSdk(34)`, and receiver forms such as `ext.minSdk`.
- Values outside an `android { }` block, property references, version-catalog calls, and `$` interpolation.
- Plugin versions written in `build.gradle(.kts)`, `alias(libs.plugins…)` lines, `kotlin("android") version "…"`, the chained `id("…").version("…")` form, and plugin ids other than `com.android.application`, `com.android.library`, and `org.jetbrains.kotlin.android`.
- Catalog keys other than `agp` and `kotlin`, and any version outside `[versions]`, including a `[plugins]` `version` or `version.ref`.
- Map notation (`group:`, `name:`, `version:`), version-catalog library aliases such as `implementation(libs.billing)`, and configuration names outside the list above, such as `debugImplementation` and `androidTestImplementation`.
- Dynamic and ranged versions (`8.+`, `latest.release`, `[8.0, 9.0)`) on plugin and catalog pins.
- Vulnerability advisories and license policy.

### Known limits and false-positive boundaries

- A literal inside `android { }` is reported when a rule matches it, including a product flavor or build type, and including a script the project no longer applies. Evergreen does not ask Gradle which variant is live.
- A plugin pin is read anywhere in `settings.gradle(.kts)`, including `pluginManagement` and a line marked `apply false`.
- String-notation test configurations are judged the same way as `implementation`.
- A catalog `kotlin` pin and the settings Kotlin Android plugin do not share a Package URL. A rule for one does not match the other.
- An unterminated comment or string, or a Kotlin string template the scanner cannot pair, makes that parser return nothing for the whole file. A `libs.versions.toml` with a multi-line string (`"""` or `'''`) does the same.
- Malformed input produces no declarations from the affected file, never a partial result, and no error is raised. A file over 1 MiB yields nothing, and a single line over 4,096 characters is skipped. Each parser keeps at most 5,000 declarations from one file.
- The eight-level and 2,000-file limits are silent. Files beyond them, and any under `build`, `.gradle`, or another skipped directory, are not scanned.
- A plugin or catalog value that is not a literal version is omitted. A string-notation coordinate is kept and compared as the version text written in the file. The analysis reports no unclassified references.

## CI runner images detector

The `ci-images` detector is **experimental**: its level is recorded as `experimental` in `benchmarks/thresholds.json`. Five targeted public repositories are pinned for it (see [VALIDATION.md](VALIDATION.md) "CI runner images corpus"); precision is not enforced, and its blind share is zero. Its lifecycle rules are in `registry/ci-images.json` and ship in the [data bundle](DATA.md). Bundled rules include the scheduled removals of the macOS 14 Sonoma and Ubuntu 22.04 hosted images, citing the [Microsoft-hosted image deprecation schedule](https://learn.microsoft.com/azure/devops/pipelines/agents/hosted-deprecation-schedule). A label is a finding only when a reviewed rule covers it. Scans read that bundled registry only.

### Supported files and declarations

| File | Declaration read | Notes |
| --- | --- | --- |
| `azure-pipelines.yml` | Literal `pool.vmImage` on the pipeline, a stage, or a job | The label is matched when it is `ubuntu-<version>`, `macos-<version>`, or `windows-<version>`, compared case-insensitively. |
| `.gitlab-ci.yml` | Root and job `image` values, including an image object's `name`, and image values in `services` | Every located value is unclassified. None become findings. |
| `.circleci/config.yml` | `docker.image` and `machine.image` under `jobs` and `executors`, and string values under `orbs` | Orbs, dynamic values, and floating aliases are unclassified. A literal image is parsed and not judged. |

Only a file named `.gitlab-ci.yml`, `azure-pipelines.yml`, or `config.yml` directly inside a `.circleci` directory is read. Files are found by walking the repository up to eight directories deep, to at most 500 files. Symbolic links are not followed, and `.git`, `node_modules`, `vendor`, `dist`, `build`, `bin`, `obj`, `target`, `.venv`, `venv`, `fixtures`, `__fixtures__`, and `testdata` are skipped. GitLab CI, CircleCI, and Azure Pipelines are never run, and nothing is fetched.

### What it reports

- An Azure `pool.vmImage` whose family and numeric version a rule's Package URL and `vers` range contain. The finding is the value's line. It carries the rule's source, replacement, deadline, and migration guidance when the rule has it. Every matching rule is reported.
- Nothing for a GitLab image or service, a CircleCI image or orb, or an Azure label no rule covers. An unclassified reference is not a finding.

### What it intentionally does not judge

- GitLab CI images and services. Decision 0014 records no authoritative GitLab lifecycle source, so a literal image is not evidence that GitLab retired it.
- CircleCI `docker.image` and `machine.image` values, including ones that look old. This version has no CircleCI Package URL mapping, so a literal image is not matched against a rule. Orb references are not image lifecycle claims, and their remote contents are not read.
- `latest`, `ubuntu-latest`, `macos-latest`, `windows-latest`, and other `*-latest` or `:latest` aliases. `cimg/<name>:current` is floating too.
- Dynamic values: `$IMAGE`, `${IMAGE}`, `$(vmImage)`, `<< parameters.image >>`, `<< pipeline.parameters.image >>`, and any value that contains `$` or `<<`.
- Azure labels outside `ubuntu-`, `macos-`, and `windows-` plus a numeric version, including `ubuntu-22.04-arm64` and `windows-2025-vs2026`.
- A pool written as a string, a pool `name` without `vmImage`, containers, resources, and `strategy.matrix` `vmImage` entries.
- CircleCI workflow executor references, `resource_class`, descriptions, and a job that only names an orb executor.
- Comments, unrelated keys, unresolved YAML aliases, merge keys, non-string values, and malformed YAML.
- Vulnerability advisories. A newer image existing is not a lifecycle finding.

### Known limits and false-positive boundaries

- An Azure label is reported when a rule matches the text, including a pipeline the project no longer runs, and including a self-hosted agent that reuses a hosted label string. Evergreen does not ask Azure DevOps which pipeline is active.
- GitLab and CircleCI references that are unclassified name the file and line. A literal CircleCI image is omitted from both findings and unclassified references.
- Malformed YAML produces no declarations from that file, never a partial result, and no error is raised. A file over 1 MiB yields nothing, and a single value over 4,096 characters is skipped.
- The eight-level and 500-file limits are silent. Files beyond them, and any under a skipped directory, are not scanned.

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
