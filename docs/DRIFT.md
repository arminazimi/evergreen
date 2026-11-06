# Runtime drift

`evergreen drift` finds every place a repository states a runtime version — version files, manifests, container images, and CI configuration — and reports, with exact locations, when the values disagree. A Dockerfile on Node.js 18, CI on 20, and `.nvmrc` on 22 is one line of output instead of three files to compare by hand.

Every command in this page reads repository files only. Drift checks never run a runtime, execute a repository's tools, or use the network. `--align` prints a patch and never writes it.

```bash
evergreen drift . --check
evergreen drift . --runtime ruby --json
evergreen drift . --runtime ruby --align 3.4
```

## How to read the report

Each runtime block lists every value with its `path:line`, the file or field it came from, the value as written, and the release line it resolves to. A value that cannot be resolved offline is reported too, with the reason. When the `pin` values select more than one release, the block says `DRIFT`. A `floor` is a minimum the project supports; when a floor is above the lowest pinned release that applies to it, the block says `FLOOR CONFLICT`. A floor that names a directory is checked against the pins that apply to that directory, not against every pin.

`--check` exits `1` when any runtime drifted or has a floor conflict. `--align <release>` requires `--runtime`, prints a unified diff for the pins it can rewrite, lists refused pins on stderr, and never writes a file. It refuses floors and ranges, and each collector documents the files it can rewrite.

## Adding a collector

One collector per runtime lives in `src/drift/<runtime>.ts`, reuses the parsers the detectors already have, and is registered once in `driftCollectors` in `src/drift/index.ts`. Each section below names the sources it reads, its release granularity, what it refuses to resolve, and which file it can align.

## Ruby

Reads, at any depth:

- `.ruby-version`, including the rbenv `ruby-3.3.1` and `3.3.1p123` forms.
- `.tool-versions` `ruby` lines, including several fallback versions.
- `Gemfile`: an exact `ruby "3.3.0"` is a pin; a literal requirement such as `ruby ">= 3.1.0"` or `ruby "~> 3.2"` is a floor.
- `Gemfile.lock` `RUBY VERSION`.
- `*.gemspec`: a literal `required_ruby_version`, such as `">= 3.1.0"` or `"~> 3.2"`, as a floor.
- `Dockerfile*` and `Containerfile*`: `FROM ruby:<tag>` and a literal `RUN asdf install ruby <version>`.
- `.github/workflows/*.yml`: the `ruby-version` input of `ruby/setup-ruby`.
- `.gitlab-ci.yml` `image:` values and `.circleci/config.yml` `docker:` images for the official `ruby` and `cimg/ruby` images.

Release granularity is `major.minor` (`3.3`).

Unresolved values are reported with the reason and excluded from the drift comparison: `system`, `latest`, an image without a tag, a moving image tag, a `${{ matrix.* }}` expression, and a requirement that states no minimum.

`align <release>` rewrites `.ruby-version`, a single-value `.tool-versions` ruby line, an exact `Gemfile` `ruby` directive, a `ruby/setup-ruby` `ruby-version` input, and the tag of a Dockerfile, GitLab CI, or CircleCI image. It refuses floors, ranges, image digests, and multi-value lines. `Gemfile.lock` is reported and refused with "regenerate the lockfile": Bundler owns that file.
`evergreen drift` finds every place a repository states a runtime version and reports, per runtime, whether those values agree. A repository that runs Node 18 in its Dockerfile, Node 20 in CI, and Node 22 in `.nvmrc` has a drift, even when every test passes on the version the developer uses. The command reads repository files only: scans never use the network and never execute repository code.
evergreen drift .                    # text report
evergreen drift . --json             # https://github.com/arminazimi/evergreen/schemas/drift.v1.schema.json
evergreen drift . --check            # exit 1 when a runtime drifts or has a floor conflict
evergreen drift . --runtime java --align 21   # print a patch; never write it
`--json` prints an `evergreen.drift.v1` document. Every pin carries its repository-relative path, the 1-based line of the value, the source it came from, the value exactly as written, and the release it resolves to offline. A value that cannot be resolved offline keeps its place in the report with an `unresolved` reason instead of a guessed release.
`--align <release>` prints a unified diff for the pins of one runtime that can be rewritten safely, and lists the refused pins on stderr. Evergreen never writes the patch.
## Java
Java releases are compared at the feature-release major: `17`, `21`, `25`. A legacy `1.8` resolves to `8`; a vendor prefix (`temurin-`) or suffix (`-tem`) is ignored. The vendor never changes support status.
| File | Fields read |
| --- | --- |
| `pom.xml` | `maven.compiler.release`, `maven.compiler.source`, `maven.compiler.target`, and `java.version` properties; `release`, `source`, and `target` in `maven-compiler-plugin` configuration, including `pluginManagement`. |
| `build.gradle`, `build.gradle.kts` | `java.toolchain.languageVersion` (`.set(...)` or `=`), `jvmToolchain(N)`, `sourceCompatibility`, and `targetCompatibility`, as literal values only. |
| `.java-version` | The first non-comment line. |
| `.sdkmanrc` | The `java=` entry. |
| `.tool-versions` | The first version of the `java` entry. |
| `Dockerfile`, `*.Dockerfile`, `Containerfile*` | `FROM` images of the `eclipse-temurin`, `openjdk`, and `amazoncorretto` families; `maven` and `gradle` tags that name a JDK, such as `3.9-eclipse-temurin-17` or `8.10-jdk21`; and `sdk install java` or `asdf install java` `RUN` lines. |
| `.github/workflows/*.yml` | The `java-version` input of `actions/setup-java`. A `${{ matrix.<key> }}` value is followed to the matrix list in the same job. |
| `.gitlab-ci.yml`, `.circleci/config.yml` | `image` references of the same JDK and build-image families. |
The Maven `release`, `source`, `target`, and `java.version` properties and the Gradle `sourceCompatibility` and `targetCompatibility` settings are floors: they say the oldest JDK the compiled code runs on, not the JDK that builds it, so a build on JDK 21 that compiles for 17 is not drift. Everything else is a `pin`: the JDK that builds or runs the project. `--align` rewrites pins only.
Reported as unresolved, never guessed:
- a Maven property reference such as `${java.version}`;
- a Gradle expression such as `JavaVersion.toVersion(libs.versions.java.get())`;
- a matrix or other workflow expression that does not resolve to a literal;
- `latest`, `lts`, `system`, or another floating version-file value;
- an image with no tag, a floating tag, or an image reference containing a variable.
`--align` rewrites only values it can select a release with:
- Maven compiler properties and `maven-compiler-plugin` settings whose text is a literal version;
- `.java-version`, `.sdkmanrc`, and `.tool-versions` entries with a literal version;
- an image tag that is a plain major, such as `eclipse-temurin:17`, or the JDK segment of a Maven or Gradle tag, such as `3.9-eclipse-temurin-17`;
- a single scalar `java-version` in `actions/setup-java`.
It refuses Gradle toolchain and compatibility settings, `Dockerfile RUN` installs, property references, floating tags, matrix values, and image tags with a digest or a non-major suffix.
# Drift
`evergreen drift` reads every place a repository states a runtime version and reports, with exact file and line, when those values select different release lines. A repository with Python 3.10 in `.python-version`, 3.11 in its Dockerfile, and 3.12 in CI has drift: tests pass on one version while production runs another.
Scans read repository files and nothing else. No drift path uses the network, runs a command, or evaluates repository code, and `--align` prints patches instead of writing files.
evergreen drift [path] [--json] [--check] [--runtime <id>] [--align <release>]
- `--check` exits `1` when any runtime has drifted or has a floor conflict.
- `--json` prints the `evergreen.drift.v1` document described by [`schemas/drift.v1.schema.json`](../schemas/drift.v1.schema.json).
- `--runtime <id>` limits the report to one runtime.
- `--align <release>` requires `--runtime`, and prints a unified diff that rewrites the pins it understands to `release`. It lists pins it refuses on stderr.
Each runtime is reported as its own block. Every pin carries its location, the source it came from, the value as written, and the release line the value selects offline. A value that cannot be resolved carries the reason instead of a guess. A `floor` is a minimum the project supports, not the version that builds it; a floor above the lowest pin is reported as a floor conflict.
Release granularity differs by runtime. Each section below states the granularity it reports and the values it leaves unresolved.
## .NET
.NET pins are reported at `major.minor` granularity: the SDK `8.0.204`, the image tag `8.0-alpine`, and the moniker `net8.0` all select `8.0`.
`netstandard*` and `netcoreapp` below 5 resolve to their own names (`netstandard2.0`, `netcoreapp3.1`) and are not compared with `netX.Y` releases. .NET Framework monikers such as `net48` are reported as unresolved.
**Pins**
| Source | Field | Align |
| --- | --- | --- |
| `global.json` | `sdk.version`, wherever the file appears | yes, keeping `rollForward` |
| `*.csproj`, `*.fsproj`, `*.vbproj` | a single `TargetFramework` in a `PropertyGroup` | yes |
| `Directory.Build.props` | a single `TargetFramework` | yes |
| `Dockerfile`, `*.Dockerfile`, `Containerfile` | `FROM mcr.microsoft.com/dotnet/{sdk,aspnet,runtime,runtime-deps}:<tag>`, including legacy `dotnet/core/*` images and `--platform` | yes |
| GitHub Actions | `actions/setup-dotnet` `dotnet-version`, one pin per line of a multi-line value | single value only |
| `.gitlab-ci.yml` | `image` and service values that name a Microsoft .NET image | no |
| `.circleci/config.yml` | job and executor `docker`/`machine` image values that name a Microsoft .NET image | no |
| `azure-pipelines.yml` | `container` and `resources.containers[].image` values that name a Microsoft .NET image | no |
A Microsoft .NET image is `mcr.microsoft.com/dotnet/sdk`, `aspnet`, `runtime`, or `runtime-deps`, or the legacy `dotnet/core/*` equivalents. Image tags keep their suffix: `8.0-alpine` selects `8.0`.
**Multi-targeting**
`<TargetFrameworks>` with several entries is intentional multi-targeting. Each entry is reported as a pin with source `TargetFrameworks`, the entries share one group, and they are not counted against each other. A source outside the list still counts: `TargetFrameworks` of `net6.0;net8.0` agrees with a Dockerfile that selects `8.0`, but drifts when the Dockerfile selects `9.0`. `--align` refuses the multi-targeting form.
**Unresolved**
A .NET Framework moniker, an MSBuild property reference such as `$(Tfm)`, a version with no minor (`8`, `latest`), a dynamic image reference, an expression, an image with no tag, and any value Evergreen does not read are reported as pins with a one-sentence reason and no release. A value is never guessed from a newer version existing.
**Align**
`--align` rewrites `global.json` `sdk.version` (keeping `rollForward`), a single `TargetFramework`, `FROM` tags that preserve the image suffix, and a single-value `setup-dotnet` `dotnet-version`. It refuses `TargetFrameworks`, MSBuild property references, .NET Framework monikers, CI image references, and any line whose form it does not recognize.
`evergreen drift` reports every place a repository states a runtime version: Dockerfiles, CI configuration, version files, manifests, and toolchain files. Each value is listed with its exact file, line, source, and the release line it resolves to offline. When the values disagree, the runtime is marked `DRIFT`; when a minimum the project requires is above the version that builds it, the value is listed as a floor conflict.
evergreen drift .              # what the repository states, by runtime
evergreen drift . --check      # exit 1 when any runtime disagrees
evergreen drift . --runtime rust --align 1.82   # print a patch; nothing is written
evergreen drift . --runtime go --align 1.22   # print a patch; nothing is written
Drift reads repository files only. It never uses the network, never executes repository code or tools, and never writes a file. `--align` prints a unified diff for review; apply it yourself, for example with `git apply`.
A value is a **pin** when it selects the version that builds or runs the project, and a **floor** when it states a minimum the project supports. Floors are compared with the lowest pinned release: a floor above it is a conflict, because the environment the pin selects cannot satisfy the project.
Values that cannot be resolved offline are still reported, with the reason. Evergreen never guesses a release.
## Rust
Release granularity is `1.minor`: the toolchain channel `1.79.0`, the image tag `1.79.0-slim-bookworm`, and the `.tool-versions` entry `1.79.0` all resolve to `1.79`. A `rust-toolchain` channel selects the toolchain that builds the project, so it is a pin; `rust-version` in `Cargo.toml` states the minimum the project supports, so it is a floor.
| Source | Field | Kind |
| `rust-toolchain.toml`, `rust-toolchain` | `channel` (or the one-line legacy form) | pin |
| `.tool-versions` | `rust` entry | pin |
| `Dockerfile*`, `Containerfile*`, `*.Dockerfile` | `FROM rust:<tag>` | pin |
| `.github/workflows/*.yml` | `dtolnay/rust-toolchain@<ref>` | pin |
| `.github/workflows/*.yml` | `dtolnay/rust-toolchain` `toolchain:` input | pin |
| `.github/workflows/*.yml` | `actions-rs/toolchain` `toolchain:` input | pin |
| `.github/workflows/*.yml` | job `container:` and `services.<name>.image` rust image | pin |
| `.gitlab-ci.yml` | `image:` or `services:` rust image | pin |
| `.circleci/config.yml` | Docker executor rust image | pin |
| `azure-pipelines.yml` | job `container:` rust image | pin |
| `Cargo.toml` | `package.rust-version` and `workspace.package.rust-version` | floor |
The Rust collector reuses the existing `rust-toolchain` and `Cargo.toml` parsers and reads Dockerfile `FROM` lines with the container parser. It reports these values as unresolved, without a release: `stable`, `beta`, `nightly`, and dated nightlies, a floating image tag such as `rust:latest`, an image with no tag, a tag that is not `1.minor`, an expression that is not a literal version, and a `.tool-versions` entry that names a `ref:` or `path:`.
`--align` rewrites `channel = "1.x"` lines and the one-line `rust-toolchain`, the `rust` entry of `.tool-versions`, `rust:<version>[-variant]` tags in Dockerfiles and CI configuration, `dtolnay/rust-toolchain@<ref>`, and the `toolchain:` input of `dtolnay/rust-toolchain` and `actions-rs/toolchain`. It keeps the target or image variant suffix. It refuses floors, named channels, expressions, and images pinned by digest.
## Go
Release granularity is `1.minor`: `go1.22.4` and the image tag `1.22.4-alpine` both resolve to `1.22`. A `go` directive is a minimum since Go 1.21 ([Go toolchains](https://go.dev/doc/toolchain), [go directive](https://go.dev/ref/mod#go-mod-file-go)), so it is a floor; a `toolchain` line selects the toolchain that builds the module, so it is a pin.
| `go.mod` | `toolchain go1.x.y` | pin |
| `go.work` | `toolchain go1.x.y` | pin |
| `go.mod` | `go 1.x[.y]` | floor |
| `go.work` | `go 1.x[.y]` | floor |
| `.go-version` | first non-comment line | pin |
| `.tool-versions` | `golang` entry | pin |
| `Dockerfile*`, `Containerfile*` | `FROM golang:<tag>` | pin |
| `.github/workflows/*.yml` | `actions/setup-go` `go-version` | pin |
| `.github/workflows/*.yml` | `actions/setup-go` `go-version-file` | pin, pointing at the named file |
| `.gitlab-ci.yml` | `image:` or `services:` golang image | pin |
| `.circleci/config.yml` | Docker executor golang image | pin |
| `azure-pipelines.yml` | job `container:` golang image | pin |
The Go collector reuses the existing `go.mod` and `go.work` parsers and reads Dockerfile `FROM` lines with the container parser. It reports these values as unresolved, without a release: a floating image tag such as `golang:latest`, an image with no tag, a tag that is not `major.minor`, a `stable` or `oldstable` `go-version`, an expression that is not a `matrix` reference, a matrix entry that is not a plain version, and a `.go-version` or `.tool-versions` value that is not a Go version.
`--align` rewrites `toolchain go1.x.y` lines, `.go-version`, the `golang` entry of `.tool-versions`, `FROM golang:<version>[-variant]` (keeping the variant suffix), and a single-value `actions/setup-go` `go-version`. It refuses floors, matrix and expression values, `go-version-file` pointers, and floating tags.
## Python
Python pins are reported at `major.minor` granularity: `3.11.4`, `3.11`, and `python-3.11` all select `3.11`. Version files and manifests are read at any depth, so a monorepo reports each service.
| `.python-version` | every line | yes |
| `.tool-versions` | the `python` line, one pin per version | yes |
| `runtime.txt` | `python-<version>` | yes |
| `Pipfile` | `[requires]` `python_version` and `python_full_version` | yes |
| `Dockerfile`, `*.Dockerfile`, `Containerfile` | `FROM python:<version>[-variant]`, including `--platform` and all stages | yes |
| GitHub Actions | `actions/setup-python` `python-version`, following a `${{ matrix.<key> }}` reference to its literal list; matrix values keep one pin each | single value only |
| `.gitlab-ci.yml` | `image` and `service` values that name a Python image | no |
| `.circleci/config.yml` | job and executor `docker`/`machine` `image` values that name a Python image | no |
| `azure-pipelines.yml` | `container` and `resources.containers[].image` values that name a Python image | no |
| `environment.yml`, `environment.yaml` | literal `python=...` entries under `dependencies`; a lower bound is a floor | no |
A Python image is `python`, `cimg/python`, or `circleci/python` on Docker Hub. A multi-version `.python-version` or `.tool-versions` line reports one pin per version.
**Floors**
| Source | Field |
| `pyproject.toml` | `[project]` `requires-python` |
| `pyproject.toml` | `[tool.poetry.dependencies]` `python` |
| `setup.cfg` | `[options]` `python_requires`, including continuation lines |
| `setup.py` | a literal `python_requires="..."` string; the file is read, never executed |
A floor resolves from its first lower bound, so `>=3.10,<3.13`, `^3.10`, and `~=3.10.2` all report `3.10`.
`3`, `3.x`, a wildcard with no minor version, `latest`, a tag or image with no version, a dynamic image reference, an expression, a constraint with no lower bound, and any value Evergreen does not read are reported as pins with a one-sentence reason and no release. A value is never guessed from a newer version existing.
`--align` rewrites `.python-version`, `.tool-versions`, `runtime.txt`, `Pipfile`, `FROM python:<version>[-variant]` (keeping the variant suffix and the rest of the instruction), and a single-value `setup-python` `python-version`. It refuses floors, matrix entries, CI image references, and any line whose form it does not recognize.

## Node.js

Node.js pins are reported at the major release: `18.19.0`, `v18`, and the image tag `18-alpine` all select `18`.

| Source | Field | Kind |
| --- | --- | --- |
| `.nvmrc` | the version line | pin |
| `.node-version` | the version line | pin |
| `.tool-versions` | the `nodejs` entry, one pin per version | pin |
| `package.json` | `volta.node` | pin |
| `package.json` | `engines.node` | floor |
| `Dockerfile`, `*.Dockerfile`, `Containerfile*` | `FROM node:<tag>`, including every stage | pin |
| `devcontainer.json` | the `image` tag and the `ghcr.io/devcontainers/features/node` feature `version` | pin |
| `.github/workflows/*.yml` | `actions/setup-node` `node-version` | pin |
| `.gitlab-ci.yml` | `image` and `services` values of the official `node`, `cimg/node`, and `circleci/node` images | pin |
| `.circleci/config.yml` | Docker executor values of those images | pin |
| `azure-pipelines.yml` | job `container` values of those images | pin |

A Dev Container image is read for the `node`, `cimg/node`, and `circleci/node` Docker Hub images and for the `devcontainers/javascript-node` and `devcontainers/typescript-node` images, whose tags carry the Node.js major after the image major, such as `1-18-bookworm`.

**LTS codenames**

`lts/<codename>` resolves through the Node.js release schedule ([nodejs/Release](https://github.com/nodejs/Release#release-schedule)): `argon` 4, `boron` 6, `carbon` 8, `dubnium` 10, `erbium` 12, `fermium` 14, `gallium` 16, `hydrogen` 18, `iron` 20, `jod` 22, and `krypton` 24. The Docker tag form `lts-<codename>[-variant]` resolves the same way.

**Matrix builds**

A `setup-node` matrix with several versions is intentional. Each value is reported as a pin with source `setup-node matrix`, the values share one group, and they are not counted against each other. A drift is reported only when a non-matrix pin disagrees with another non-matrix pin, or when a non-matrix pin falls outside the matrix.

**Unresolved**

`lts/*`, `latest`, `current`, `node`, an LTS codename Evergreen does not know, an image tag that names no Node.js release, a dynamic image reference, an expression, a matrix entry that is not a plain version, and a floor with no lower bound are reported as pins with a one-sentence reason and no release.

`--align` rewrites `.nvmrc`, `.node-version`, `.tool-versions`, `package.json` `volta.node`, `FROM node:<major>[-variant]` (keeping the variant suffix and the rest of the instruction), and a single-value `actions/setup-node` `node-version`. It refuses floors, `setup-node` matrices, Dev Container and CI image references, and any line whose form it does not recognize.

## Terraform

Terraform pins are reported at `major.minor` granularity: the `.terraform-version` value `1.17.0`, the image tag `1.17`, and `required_version = ">= 1.17.0"` all select `1.17`.

| Source | Field | Kind |
| --- | --- | --- |
| `.terraform-version`, at any depth | the version line, one pin per file | pin |
| `.tool-versions` | the first version of the `terraform` entry | pin |
| `Dockerfile`, `*.Dockerfile`, `Containerfile*` | `FROM hashicorp/terraform:<tag>` | pin |
| `.github/workflows/*.yml` | `hashicorp/setup-terraform` `terraform_version` | pin |
| `.github/workflows/*.yml` | job `container:` and `services.<name>.image` `hashicorp/terraform` images | pin |
| `.gitlab-ci.yml` | `image:` or `services:` `hashicorp/terraform` images | pin |
| `.circleci/config.yml` | Docker executor `hashicorp/terraform` images | pin |
| `azure-pipelines.yml` | job `container:` `hashicorp/terraform` images | pin |
| `*.tf`, in every module | `required_version` | pin when exact (`"1.17.0"`, `"= 1.17.0"`, `"~> 1.17.0"`), else floor |

The collector reuses the existing `.terraform-version` and `.tool-versions` parsers and reads `required_version` with the HCL parser. Provider versions in `required_providers` are not Terraform CLI versions and are not read.

**Directories**

Version files and `required_version` apply to the directory they live in, because modules in different directories can legitimately differ. A floor is checked only against the pins that apply to its directory: the nearest `.terraform-version` or `.tool-versions` at or above it, or the repository-wide pins (Dockerfiles, CI images, `setup-terraform`) when its directory declares none. A floor of `>= 1.17.0` beside a module `.terraform-version` of `1.17.0` agrees, even when the rest of the repository pins `1.16`. Pins are still compared across the repository, so modules on different release lines are a drift.

**Unresolved**

`latest`, `min-required`, `system`, a partial version such as `1.9`, a prerelease, a `.tool-versions` entry that names a `ref:` or `path:`, an image with no tag, a floating image tag, a workflow expression, and a constraint with no lower bound are reported with a one-sentence reason and no release.

**Align**

`--align <release>` rewrites `.terraform-version`, a single-value `.tool-versions` `terraform` entry, `FROM hashicorp/terraform:<version>` tags, a single-value `setup-terraform` `terraform_version`, and an exact `required_version` (keeping the `=` form when written). Where a full version is required, a release line such as `1.18` is written as `1.18.0`. It refuses floors, ranges, CI image references, and images pinned by digest.

## PHP

PHP pins are reported at `major.minor` granularity: `8.3.12`, `8.3`, and the image tag `8.3-fpm` all select `8.3`.

| Source | Field | Kind |
| --- | --- | --- |
| `composer.json` | `config.platform.php` | pin |
| `composer.json` | `require.php` | floor |
| `composer.lock` | `platform.php`, when present | floor |
| `.php-version` | the single version, including the phpenv `php-8.3.12` form | pin |
| `.tool-versions` | the `php` entry, one pin per version | pin |
| `Dockerfile`, `*.Dockerfile`, `Containerfile*` | `FROM php:<tag>` and a literal `RUN asdf install php <version>` | pin |
| `.github/workflows/*.yml` | the `php-version` input of `shivammathur/setup-php` | pin |
| `.gitlab-ci.yml` | `image:` values that name the official `php` image | pin |
| `.circleci/config.yml` | Docker executor values that name the `php` or `cimg/php` image | pin |

A PHP image is the Docker Hub `php` image, or `cimg/php` in CI. Image tags keep their variant suffix: `8.3-fpm` selects `8.3`.

A `setup-php` matrix with several versions is intentional. Each value is reported as a pin with source `setup-php matrix`, the values share one group, and they are not counted against each other.

**Floors**

`require.php` and `composer.lock` `platform.php` state what the project installs against, not the PHP that builds it, so they are floors. A floor resolves from its first lower bound: `^8.2`, `>=8.1`, and `8.1.*` all resolve to their major.minor. A floor above the lowest pinned release is a floor conflict, because that environment cannot install the project.

**Unresolved**

`latest`, `system`, a version with no minor (`8`), a moving image tag, an image with no tag, an expression that is not a `matrix` reference, and a constraint with no lower bound are reported as pins with a one-sentence reason and no release. A value is never guessed from a newer version existing.

**Align**

`--align <release>` rewrites `.php-version` (keeping the `php-` prefix), a single-value `.tool-versions` `php` line, `composer.json` `config.platform.php`, `FROM php:<version>[-variant]` tags, GitLab CI and CircleCI image tags, and a single-value `setup-php` `php-version`. It refuses floors, `composer.json` `require.php`, `composer.lock`, `setup-php` matrix values, multi-value `.tool-versions` lines, and image references pinned by digest. `composer.lock` is reported and refused with "regenerate the lockfile": Composer owns that file.

## Elixir

Elixir pins are reported at `major.minor` granularity: `1.16.2`, `1.16`, and the image tag `1.16.2-otp-26-alpine` all select `1.16`.

| Source | Field | Kind |
| --- | --- | --- |
| `.elixir-version` | the single version, including the asdf `1.16.2-otp-26` form | pin |
| `.tool-versions` | the `elixir` entry, one pin per version, the `-otp-NN` suffix kept as written | pin |
| `mix.exs` | the project `elixir:` constraint, quoted literals only | floor |
| `Dockerfile`, `*.Dockerfile`, `Containerfile*` | `FROM elixir:<tag>` and `FROM hexpm/elixir:<elixir>-erlang-<otp>-<os>` | pin |
| `.github/workflows/*.yml` | the `elixir-version` input of `erlef/setup-beam` | pin |
| `.gitlab-ci.yml` | `image:` values that name the official `elixir` or `hexpm/elixir` image | pin |
| `.circleci/config.yml` | Docker executor values that name `elixir` or `hexpm/elixir` | pin |

An Elixir image is the Docker Hub `elixir` image or the `hexpm/elixir` build image; other registries and other repositories are not read. Image tags keep their suffixes: `1.16.2-otp-26-alpine` selects `1.16`, and `hexpm/elixir:1.17.3-erlang-27.1.1-alpine-3.20` selects `1.17` from the version its tag names first.

The collector reuses the Elixir detector's runtime parser and `mix.exs` parser, so the same version grammar decides what is a pin here as in `evergreen scan`. A `setup-beam` matrix with several Elixir versions is intentional. Each value is reported as a pin with source `setup-beam elixir matrix`, the values share one group, and they are not counted against each other.

**Floors**

`mix.exs` `elixir:` states the oldest Elixir the project supports, not the one that builds it, so it is a floor. Only a quoted literal constraint is read: `~> 1.15` and `>= 1.15.7` resolve to their first lower bound, `1.15`. `Mix` is never run and `mix.exs` is never evaluated. A floor above the lowest pinned Elixir is a floor conflict, because that project cannot build on the runtime its own pins select.

**Unresolved**

`latest`, `main`, a version with no minor (`1`), an image with no tag, a moving image tag such as `elixir:latest`, a `hexpm/elixir` tag that is not `<elixir>-erlang-<otp>[-<os>]`, an expression that is not a `matrix` reference, and a constraint with no lower bound are reported as pins with a one-sentence reason and no release. A value is never guessed from a newer version existing.

**Align**

`--align <release>` rewrites `.elixir-version` (keeping its `-otp-NN` suffix), a single-value `.tool-versions` `elixir` line, a single-value `setup-beam` `elixir-version` (its quote style kept), and `elixir:<version>[-otp-<otp>][-variant]` tags in Dockerfiles, GitLab CI and CircleCI (the OTP part and the variant are preserved). It refuses the `mix.exs` floor, every `hexpm/elixir` tag — choosing its OS part is a decision, not a rewrite — `setup-beam` matrix values, multi-value `.tool-versions` lines, and image references pinned by digest.

## Erlang/OTP

Erlang/OTP pins are reported at the OTP major: `26.2.5`, `OTP-26.2.5`, and the `-otp-26.2.5` of an Elixir pin all select `26`.

| Source | Field | Kind |
| --- | --- | --- |
| `.tool-versions` | the `erlang` entry, one pin per version | pin |
| `.elixir-version`, `.tool-versions` | the `-otp-NN` suffix of an Elixir version that names one | pin |
| `Dockerfile`, `*.Dockerfile`, `Containerfile*`, `.gitlab-ci.yml`, `.circleci/config.yml` | the `erlang-<otp>` part of a `hexpm/elixir` tag, and the `-otp-<otp>` part of an `elixir` tag | pin |
| `.github/workflows/*.yml` | the `otp-version` input of `erlef/setup-beam`, including its `OTP-26.2.5` form | pin |

OTP is versioned with Elixir, so one line states both: `FROM hexpm/elixir:1.17.3-erlang-27.1.1-alpine-3.20` is an Elixir `1.17` pin for the Elixir collector and an OTP `27` pin for this one, at the same path and line. The Docker Hub `erlang` image is not a source of drift here, because the issue that scoped this collector lists only the sources above; a repository that runs Erlang on its own gets no pin from `FROM erlang:27`.

There is no Erlang floor source: `mix.exs` constrains Elixir, not OTP.

A `setup-beam` matrix with several OTP versions is intentional: the values are reported with source `setup-beam otp matrix`, share one group, and are not counted against each other.

**Unresolved**

`main`, `master`, and `latest`, an `otp-version` that is not a version (`edge`), an expression that is not a `matrix` reference, an `.tool-versions` `erlang` token that is not an OTP release, and a workflow that does not parse as YAML are reported with a reason or skipped; nothing is guessed. An Elixir version with no `-otp-` part simply yields no OTP pin.

**Align**

`--align <release>` rewrites a single-value `.tool-versions` `erlang` line, the `-otp-NN` suffix of `.elixir-version` and of a `.tool-versions` `elixir` line, a single-value `setup-beam` `otp-version` (written as the bare major, with the line's quotes kept), and the `-otp-<otp>` part of `elixir:<version>-otp-<otp>[-variant]` tags in Dockerfiles, GitLab CI and CircleCI. It refuses every `hexpm/elixir` tag, `setup-beam` matrix values, and image references pinned by digest.
