# Evergreen

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/arminazimi/evergreen/main/brand/exports/banner-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/arminazimi/evergreen/main/brand/exports/banner-light.png">
    <img alt="Evergreen — Know what breaks next." src="https://raw.githubusercontent.com/arminazimi/evergreen/main/brand/exports/banner-light.png" width="100%">
  </picture>
</p>

[![CI](https://img.shields.io/github/actions/workflow/status/arminazimi/evergreen/ci.yml?branch=main&label=CI&logo=github&logoColor=white&labelColor=0C1110&color=2F7D5B&style=flat)](https://github.com/arminazimi/evergreen/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Farminazimi%2Fevergreen%2Fbadges%2Fcoverage.json&labelColor=0C1110&style=flat)](https://github.com/arminazimi/evergreen/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/evergreen-deprecation.svg?logo=npm&logoColor=white&labelColor=0C1110&color=2F7D5B&style=flat)](https://www.npmjs.com/package/evergreen-deprecation)
[![Evergreen](https://raw.githubusercontent.com/arminazimi/evergreen/badges/evergreen-badge.svg)](https://github.com/arminazimi/evergreen/actions/workflows/ci.yml)
[![skills.sh](https://skills.sh/b/arminazimi/evergreen)](https://skills.sh/arminazimi/evergreen/evergreen-deprecation)

Evergreen finds **end-of-life and deprecated** runtimes, packages, and GitHub Actions in your repository, shows the exact file and line, and backs every finding with an authoritative source, a replacement, and migration steps. It runs on your machine as a CLI, a local MCP server, a GitHub Action (with SARIF for code scanning), and an Agent Skill, so people and coding agents can find lifecycle risk before it breaks a build, and check a dependency before adding it. Scans are deterministic and offline, and need no account.

Read the [public documentation](https://arminazimi.github.io/evergreen/), run the [90-second demo](docs/DEMO.md), or inspect the [validation report](docs/VALIDATION.md). For AI tools, the docs are also published as [`llms.txt`](https://arminazimi.github.io/evergreen/llms.txt) and [`llms-full.txt`](https://arminazimi.github.io/evergreen/llms-full.txt).

## What it covers

| Ecosystem | What Evergreen reads | What it reports |
| --- | --- | --- |
| **Container base images** *(experimental)* | `Dockerfile`, `*.Dockerfile`, `Containerfile`, `compose.yaml`, `docker-compose.yml`: base images of official `node`, `python`, `postgres`, `mysql`, and `ruby` | Image release lines that are end of life. Variables, `latest`, and floating tags are listed as unclassified, never guessed. See [Container base images](docs/detectors/container.md) |
| **.NET** *(beta)* | `global.json`, `*.csproj`/`*.fsproj`/`*.vbproj`, `Directory.Build.props`, `Directory.Packages.props`, `packages.lock.json`: the pinned SDK, target frameworks, and direct NuGet packages | .NET release lines past end of support, and direct packages their publisher deprecated, with the C# files that use them. .NET Framework, `netstandard`, MSBuild properties, floating versions, and ranges are not judged. See [.NET](docs/detectors/dotnet.md) |
| **Go** *(experimental)* | `go.mod` and `go.work`: `go` and `toolchain` directives, and direct `require` entries | Go release lines that no longer receive fixes, and direct modules with a lifecycle rule. Versions Evergreen cannot read are listed as unclassified. See [Go](docs/detectors/go.md) |
| **GitHub Actions** | `.github/workflows/*.yml`: `uses:` references to actions, including full-SHA pins resolved through a trailing version comment or a bundled release map | Actions on retired runtimes (such as Node.js 20) and retired or deprecated majors, at the exact line |
| **C and C++** *(experimental)* | `CMakeLists.txt`, `conanfile.txt`, `conanfile.py`, and `vcpkg.json` | CMake policy compatibility removals and deprecations, at the exact declaration. Other declarations require a matching reviewed rule. See [C and C++](docs/COMPATIBILITY.md#c-and-c-detector) |
| **CI runner images** *(experimental)* | `.gitlab-ci.yml` `image` and `services`, `.circleci/config.yml` `docker.image`, `machine.image`, and orbs, and `azure-pipelines.yml` `pool.vmImage` | Azure hosted-image labels a reviewed rule covers, at the exact line. GitLab images and CircleCI orbs, variables, and floating aliases are unclassified. A literal CircleCI image is not judged. See [CI runner images](docs/COMPATIBILITY.md#ci-runner-images-detector) |
| **Java and Kotlin (JVM)** *(beta)* | `pom.xml`, `build.gradle`, `build.gradle.kts`, `.java-version`, `.sdkmanrc`, `.tool-versions`: the JDK a project pins or targets, and direct Maven dependencies. See [Java and Kotlin](docs/detectors/java.md) | JDK feature releases that are out of support, and dependencies whose POM says they moved. Property references and expressions are listed as unclassified |
| **Kubernetes APIs** *(beta)* | `*.yaml`, `*.yml` manifests, Helm chart `templates/`, and `kustomization.yaml`: the literal `apiVersion` and `kind`, and kustomize patches. See [Kubernetes APIs](docs/detectors/kubernetes.md) | API versions the Kubernetes project says are no longer served. Helm values, cluster-guarded templates, and anything it cannot read literally are skipped |
| **Node.js** | `engines.node`, `volta`, `.nvmrc`, `.node-version` | Runtime versions that are end of life or out of support |
| **npm** | `package.json` dependencies, `package-lock.json`, `npm-shrinkwrap.json`, `yarn.lock`, `pnpm-lock.yaml`, and the imports and calls that use each package | Deprecated or unmaintained packages, with the replacement and where the package is used |
| **Python** | `pyproject.toml`, `requirements*.txt`, `.python-version`, `runtime.txt`, `.tool-versions`, `poetry.lock`, `uv.lock`, `Pipfile.lock` | Python versions that are end of life, and deprecated or obsolete packages |
| **Dart and Flutter** *(experimental)* | `pubspec.yaml`, `pubspec.lock`, `.fvmrc`, `.fvm/fvm_config.json`: SDK constraints, direct dependencies, resolved packages, and the pinned Flutter version | Dart SDK releases that no longer receive security updates when pinned exactly, and discontinued pub packages with the files that use them. Constraint ranges such as `>=3.8.0 <4.0.0` are not judged. See [Dart and Flutter](docs/detectors/dart.md) |
| **Database runtimes** *(experimental)* | `compose.yaml` / `docker-compose.yml` image tags (`postgres`, `mysql`, `mariadb`, `redis`, `mongo`) and `engine_version` on AWS managed database resources in `*.tf` | PostgreSQL 11–13 and MySQL 5.7 and 8.0 past end of life. Floating tags, variables, module blocks, and Compose files with YAML aliases are not judged. See [Database runtimes](docs/detectors/database.md) |
| **Shell and PowerShell** *(experimental)* | `#Requires -Version` in `*.ps1` / `*.psm1`, `PowerShellVersion` in `*.psd1`, and pinned `mcr.microsoft.com/powershell` image tags in `.github/workflows` | PowerShell 6.x and 7.0–7.3 past end of support. Windows PowerShell 5.1, shell names, Bash images, dynamic values, and directives with extra options are not judged. See [Shell and PowerShell](docs/detectors/shell.md) |
| **Terraform** *(experimental)* | `*.tf` (`required_version`, `required_providers`), `.terraform.lock.hcl`, `.terraform-version`, `.tool-versions`: constraints, locked providers, and the pinned Terraform CLI | Terraform CLI release lines that no longer receive support when pinned exactly or by a `~> X.Y.Z` constraint. Ranges such as `>= 1.5` are not judged. See [Terraform](docs/detectors/terraform.md) |
| **Rust** *(experimental)* | `Cargo.toml`, `Cargo.lock`, `rust-toolchain(.toml)`: the pinned toolchain and direct crate dependencies | Toolchains older than the newest stable release, and direct dependencies on unmaintained crates with the files that use them. `edition`, `rust-version`, `stable`, and anything it cannot read literally are not judged. See [Rust](docs/detectors/rust.md) |
| **Swift** *(beta)* | `.swift-version`, `.xcode-version`, `Package.swift`, `Package.resolved`, and the application-target `IPHONEOS_DEPLOYMENT_TARGET` in `project.pbxproj` | Xcode and iOS releases App Store Connect no longer accepts, Swift toolchain lines with a lifecycle rule, and packages with a rule. Libraries and `platforms:` minimums are not judged. See [Swift](docs/detectors/swift.md) |
| **Serverless runtimes** *(beta)* | `Runtime` in AWS SAM and CloudFormation templates, `provider.runtime` and `runtime` in `serverless.yml`, and `runtime` in Terraform `aws_lambda_function`, Google Cloud Functions, and Azure function apps | Lambda and Cloud Functions runtimes their vendor lists as end of life. See [Serverless runtimes](docs/detectors/serverless.md) |
| **Ruby** *(experimental)* | `.ruby-version`, `.tool-versions`, `Gemfile`, `Gemfile.lock` | Ruby release lines past end of support and yanked gems, with the Ruby files that use a gem. See [Compatibility](docs/COMPATIBILITY.md#ruby-detector) |
| **PHP** *(experimental)* | `.php-version`, `.tool-versions`, `composer.json`, `composer.lock` | PHP release lines past end of support and abandoned Composer packages. See [Compatibility](docs/COMPATIBILITY.md#php-detector) |
| **Android** *(experimental)* | `build.gradle(.kts)`, `settings.gradle(.kts)`, `libs.versions.toml`: SDK levels, Android Gradle Plugin, Kotlin plugin, and Maven dependencies | Declarations that a reviewed rule names, such as Google Play Billing Library majors 5 through 9. See [Compatibility](docs/COMPATIBILITY.md#android-detector) |

The level in parentheses is the detector's maturity; the full list with each level is the [ecosystem coverage matrix](docs/COMPATIBILITY.md#ecosystem-coverage), and earned precision and recall per detector are on the [accuracy dashboard](https://arminazimi.github.io/evergreen/dashboard/). Each finding carries its rule's sources, review date, and migration steps; see [Lifecycle rules](docs/RULES.md). Other ecosystems are not guessed at: Evergreen reports a package it has no rule for as `no-data`, never as safe, and new ecosystems start from a [generated detector skeleton](docs/DETECTORS.md#start-a-new-detector-in-this-repository). The [compatibility matrix](docs/COMPATIBILITY.md) lists supported environments and hosts.

## Product principles

- Local-first: source code stays on the user's machine or CI runner.
- Deterministic core: findings do not require an LLM.
- Evidence-backed: every deprecation claim links to an authoritative source.
- Agent-ready: every human-readable report has a machine-readable equivalent.
- Extensible: ecosystems are added through detectors rather than core rewrites.

## Quickstart

Requirements: Node.js 22 or newer.

```bash
npx evergreen-deprecation scan .
```

Give an agent a short answer instead of the full report: one line per finding with its id, location, severity, and replacement, most severe first, capped at 25 findings (the rest are counted) and under 8 KiB:

```bash
npx evergreen-deprecation scan . --format compact
```

Verify that the CLI, local MCP server, Agent Skill, plugin foundations, and CI
workspace are ready without changing configuration or uploading repository data:

```bash
npx evergreen-deprecation doctor .
npx evergreen-deprecation doctor . --json
```

See the [public compatibility matrix](docs/COMPATIBILITY.md) for supported,
experimental, and unsupported combinations.

Discover Evergreen's versioned capabilities and entry points programmatically:

```bash
npx evergreen-deprecation capabilities --json
```

The [auto-discovery contract](docs/CAPABILITIES.md) defines the shared identifiers
used by the CLI, MCP server, Agent Skill, plugins, and CI integrations.

Create a baseline for accepted existing findings, then report only new lifecycle regressions:

```bash
npx evergreen-deprecation baseline .
npx evergreen-deprecation scan . --baseline .evergreen-baseline.json
```

Check a single dependency before adding it, without scanning a repository:

```bash
npx evergreen-deprecation check pkg:npm/request@2.88.2
npx evergreen-deprecation check pkg:github/actions/checkout@v4 --json
```

The command prints the lifecycle problem, replacement, and evidence, and exits `1` when a rule at or above `--fail-on` (default `high`) applies, `0` otherwise, and `2` for invalid input. A package Evergreen has no rule for reports `no-data`, which is not a claim that it is safe. Without a version, a package whose rules only cover some versions reports `version-dependent`; add a version to get a definite answer.

Lifecycle rules can be refreshed between releases from signed bundles, and scans stay offline unless you ask:

```bash
npx evergreen-deprecation data status
npx evergreen-deprecation data update
```

See [Lifecycle data](docs/DATA.md) for the signing and trust model, pinning, and what happens when a download cannot be verified.

Inspect the evidence and migration direction for one result:

```bash
npx evergreen-deprecation explain '<finding-id>' .
```

Generate portable migration context for a human or coding agent:

```bash
npx evergreen-deprecation context '<finding-id>' . --json
```

Migration packets contain rule-specific constraints and steps, exact affected files and usages, authoritative sources, and suggested verification commands. Evergreen never executes those commands automatically. See the [migration packet guide](docs/MIGRATION_PACKETS.md).

Tell the coding agents working in a repository to check dependencies before adding them. This adds (or refreshes) a clearly marked section in `AGENTS.md`, or `CLAUDE.md` if that is the file you have; running it again changes nothing, and nothing outside the markers is touched:

```bash
npx evergreen-deprecation init --agents --dry-run   # show the change
npx evergreen-deprecation init --agents
```

To do this for every coding agent a repository is already set up for, run `setup`. It detects Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot, and Kilo Code configuration, shows the change for each host's instruction file, and writes only after you confirm (or pass `--yes`). It uses the same marked section as `init --agents`, so existing rules are never overwritten:

```bash
npx evergreen-deprecation setup --dry-run   # print the plan
npx evergreen-deprecation setup             # ask, then write
npx evergreen-deprecation setup --yes       # no prompt (CI, scripts)
```

Connect a coding agent through the local MCP server:

```bash
npx --yes --package evergreen-deprecation evergreen-mcp
```

The stdio server exposes `scan_repository`, `list_deprecations`, `explain_deprecation`, `create_migration_context`, `verify_migration`, and `check_dependency` (check one package before adding it). See the [local MCP guide](docs/MCP.md) for host configuration, the intended workflow, and privacy guarantees.

## Agent Skill

Install the vendor-neutral Agent Skill from the monorepo:

```bash
npx skills add arminazimi/evergreen
```

Pull future revisions with:

```bash
npx skills update evergreen-deprecation
```

The [`evergreen-deprecation` Skill](skills/evergreen-deprecation/README.md) teaches discovery, explanation, migration, and verification while leaving detection and migration logic inside Evergreen. It is discoverable on [skills.sh](https://skills.sh/arminazimi/evergreen/evergreen-deprecation) and has been install-validated for Codex, Claude Code, Cursor, GitHub Copilot, and Gemini CLI. See the [Agent Skill guide](docs/AGENT_SKILLS.md) for evaluation, compatibility, limits, and security assumptions.

Codex and Claude plugin packages are generated from that same Skill and MCP workflow. Their [packaging architecture](docs/PLUGIN_PACKAGING.md) keeps host manifests thin and fails CI when either package drifts from the canonical sources.
The [cross-host evaluation](docs/PLUGIN_EVALS.md) publishes shared-corpus results, context budgets, permission behavior, and security limitations; the same checks block release regressions in `npm run check`.

Evergreen runs locally and does not upload repository contents.

## Development

```bash
npm install
npm run check
```

The initial detector reports unsupported major versions of five first-party actions with exact file and line locations:

- `actions/checkout`
- `actions/setup-node`
- `actions/cache`
- `actions/upload-artifact`
- `actions/download-artifact`

Pinned commit SHAs and dynamic expressions are intentionally left unclassified until Evergreen can resolve them without guessing.

The npm detector also reads `package.json`, npm/pnpm/Yarn lockfiles, Node.js runtime declarations, and a small evidence-backed registry of deprecated direct dependencies. Use `evergreen explain <finding-id>` to inspect a finding and its sources. If a finding is wrong, `evergreen report-issue <finding-id>` prints a Markdown report with the rule, its evidence, and a few redacted lines of the declaring file, and never opens an issue or uses the network.

The Python detector reads PEP 621 and Poetry metadata from `pyproject.toml`, `requirements*.txt`, common runtime-version files, and uv/Poetry/PDM/Pipenv lockfiles. It reports unsupported Python declarations and lifecycle risks in direct dependencies while ignoring transitive-only lockfile entries.

## Source usage analysis

Package lifecycle findings now include the concrete imports, calls, and configuration keys that make a migration necessary. Matching is language-aware and alias-aware for JavaScript, TypeScript, and Python, with configuration-key support for JSON, YAML, TOML, INI, and Python settings. Each match includes its exact file, line, column, and source excerpt, plus a migration-impact estimate based on affected usages and files.

The analyzer scans the repository once for a batch of detector contracts and ignores generated, dependency, build, and environment directories. Run the repeatable accuracy and scan-time benchmark with:

```bash
npm run benchmark:usage
```

See [the benchmark notes](docs/BENCHMARKS.md) for the corpus and interpretation.

## GitHub Action

Evergreen can annotate pull requests, suppress accepted findings with a baseline, fail on a chosen severity, and upload the complete JSON report:

```yaml
permissions:
  contents: read

steps:
  - uses: actions/checkout@v7
  - uses: arminazimi/evergreen@v0.5.0
    with:
      baseline: .evergreen-baseline.json
      fail-on-severity: high
```

Pin a full commit SHA instead of a version tag when your threat model requires immutable third-party action references. See the [GitHub Action guide](docs/GITHUB_ACTION.md) for setup, inputs, permissions, artifacts, and privacy boundaries.

## Detector SDK

External detectors can use the versioned interface exported by `evergreen-deprecation/sdk`. The scan engine composes compatible detectors without importing any built-in implementation.

See the [detector authoring guide](docs/DETECTORS.md) and the [minimal detector example](examples/detectors/todo-comments.ts).

## Initial product shape

The CLI is the product. Detectors extend it, GitHub Actions automate it, and the local MCP server exposes it to agents. A hosted backend is intentionally outside the roadmap; lifecycle data updates through a signed, offline-verifiable data channel instead.

See [the roadmap](docs/ROADMAP.md), [architecture](docs/ARCHITECTURE.md), [brand guide](brand/BRAND_GUIDE.md), and [contribution guide](CONTRIBUTING.md).

## Community

Questions, ideas, and things you built with Evergreen belong in [GitHub Discussions](https://github.com/arminazimi/evergreen/discussions): use **Q&A** to ask, **Ideas** to propose, and **Show and tell** to share. Use issues for bugs, lifecycle rule requests, and ecosystem requests.

## License and brand

Evergreen source code is licensed under the [Apache License 2.0](LICENSE). The
Evergreen name, logo, and files in [`brand/`](brand/) are proprietary brand assets
and are covered by separate [brand asset terms](brand/LICENSE.md).
