# Upgrade check

`evergreen upgrade-check --to <runtime@version> [path] [--json]` answers, offline and from files already in the repository, whether a project can move to a target runtime. It lists each blocker, warning, and unknown with the exact lockfile or manifest entry behind it. Agents get the same answer through the `check_upgrade` MCP tool.

```bash
evergreen upgrade-check --to php@8.4 .
evergreen upgrade-check --to nodejs@22 . --json
```

The text output starts with the verdict, then one line per issue:

```text
php@8.4: blocked (1 blockers, 0 warnings, 0 unknown)
composer.lock:9  acme/http-client@2.1.0  acme/http-client@2.1.0 requires php ^7.4, which excludes PHP 8.4.  [lockfile: require.php: ^7.4]
```

The JSON output is an `evergreen.upgrade.v1` document that conforms to [`schemas/upgrade.v1.schema.json`](../schemas/upgrade.v1.schema.json). Exit codes: `1` when the verdict is `blocked`, `0` for `ready` and `unknown`, `2` for bad input.

An analyzer only runs when the repository has the files it reads. Each issue names its analyzer, its level (`blocker`, `warning`, or `unknown`), the affected subject, the path and line, and the evidence value exactly as written.

- `blocker`: the project will not install or run on the target.
- `warning`: it works but is deprecated on the target.
- `unknown`: the evidence needed to judge it is missing.

## What it cannot know

- **Native extensions and build-time requirements.** A package may fail to build on the target for reasons its metadata does not state.
- **Packages without declared support ranges.** If a package never declares which runtime it supports, the analyzer reports `unknown` or nothing, never `ready` by assumption.
- **Code paths outside the source.** Dynamic loading, `eval`, generated code, and behavior that only appears at runtime are not visible here.
- **Your CI images and operating system.** The runtime inside a container image or on a runner is not part of this check.
- **Unresolved dependencies.** When a lockfile does not record a support range for a package, no analyzer can judge that package.
- **Anything at install time.** Evergreen never runs a package manager, Compiler, or test suite, and no scan uses the network.

An `unknown` verdict means Evergreen found no evidence for that runtime in this repository. It is not a statement that the upgrade is safe.

The worked commands below read the examples under `examples/upgrade/`. Their manifests and lockfiles are committed with scanner-neutral names ([decision 0027](decisions/0027-fixtures-invisible-to-scanners.md)), so `dist/tools/examples.js` copies an example to a temporary directory, restores the real names there, and runs the command inside it. Run `npm run build` first; nothing is written to the repository.

## Composer

The Composer analyzer (`composer-lock`) runs for `php` targets when `composer.lock` exists.

**Files and fields**

- `composer.lock` `packages[*].require.php` — a `blocker`.
- `composer.lock` `packages-dev[*].require.php` — a `warning`.
- `composer.lock` top-level `platform.php` — a `blocker`. This is the platform requirement the lockfile was resolved against.
- `composer.lock` top-level `platform-overrides.php` — a `blocker`.
- `composer.json` `require.php` — a `blocker`, with evidence kind `manifest`.

Each issue carries the constraint exactly as written (for example `^7.4` or `>=8.1 <8.5`) and the line of the field it came from. Package subjects are `<name>@<version>`; platform subjects are `platform.php` and `platform-overrides.php`; the project's own constraint uses the subject `composer.json`.

**Version syntax**

The matcher understands Composer's constraint syntax:

- caret ranges: `^1.2.3`, `^0.3`, `^0.0.3`
- tilde ranges: `~1.2`, `~8.4.0`
- comparisons: `>=`, `>`, `<=`, `<`, `!=`, `<>`, `==`, `=`
- wildcards: `*`, `1.*`, `1.0.x`
- hyphen ranges: `1.0 - 2.0`
- OR: `||` and `|`
- AND: space- or comma-joined terms, such as `>=8.1 <8.5` or `>=8.1, <8.5`
- pre-release suffixes: `8.4.0RC1`, `8.4.0-beta1`

A target written as a release line (`8.4`) is tested as both `8.4.0` and `8.4.99`, so an upper bound written as `<8.5` is not mistaken for a blocker. A target written with three or more parts (`8.4.0`) is tested as written.

**What it reports as `unknown`**

- A `require.php` value that is not a constraint this matcher understands, such as a truncated OR (`^8.4 ||`) or a value containing an unevaluated `${...}` expression.

A missing `require.php`, a `*` constraint, or a constraint that includes the target produces no issue. Composer itself is never run, and the lockfile is parsed as untrusted JSON.

## Go modules and vendored requirements

Analyzer id `go-modules`; runtime `go`. It applies when the repository root has a `go.mod`.

**Files and fields it reads**

- `go.mod`: the `go` directive and its line.
- `go.work`: the `go` directive and its line, when the workspace file is in the repository root.
- `vendor/modules.txt`: every `# <module> <version>` header and the `## explicit; go <version>` (or `## go <version>`) annotation that follows it. Package lines are ignored.
- The bundled `registry/go.json` rules for `pkg:generic/golang`.

**Version syntax it understands**

Release numbers as Go writes them: `1.23`, `1.23.0`, and a leading `go` (`go1.23.0`) are accepted and compared part by part. A target that is not a release number, such as `nightly`, is reported as `unknown`; it is never compared.

**What it reports**

- `blocker`, `manifest`: the target is below the `go` directive of `go.mod` or `go.work`. Since Go 1.21 the `go` line is a required minimum, not advice: a Go toolchain refuses a module that declares a newer Go version. The evidence is the directive value as written, at its line.
- `blocker`, `lockfile`: the target is below the `go` version `go mod vendor` recorded for a dependency in `vendor/modules.txt`. The subject is `<module>@<version>` and the evidence is the annotation line exactly as written.
- `warning`, `rule`: the target itself matches a bundled lifecycle rule for Go, so it is deprecated or end-of-support. The evidence is the rule id.
- `unknown`: `vendor/modules.txt` is absent, or records no `go` version. Dependencies' Go requirements are not in the repository without vendoring, so Evergreen reports `unknown` for them instead of assuming they are compatible. It does not run `go mod tidy` or any Go command to find out.

**Sources**

- [Go Modules Reference: `go` directive](https://go.dev/ref/mod#go-mod-file-go): the `go` line is a minimum required Go version since Go 1.21, and must be greater than or equal to the `go` line of every dependency.
- [Go Modules Reference: `go.work` files](https://go.dev/ref/mod#go-work-file-go): the workspace `go` directive names the toolchain version the workspace is written for.
- [Go Modules Reference: vendoring](https://go.dev/ref/mod#vendoring): `go mod vendor` writes `vendor/modules.txt` and records the `go` version from each dependency's `go.mod` since Go 1.17.
- [Go toolchains](https://go.dev/doc/toolchain): how the `go` directive selects a toolchain.

## Dart and Flutter

Applies when `pubspec.lock` exists. Runtimes: `dart` and `flutter`.

| File | Field | What it means |
| --- | --- | --- |
| `pubspec.lock` | `sdks.dart` | The Dart SDK bound shared by every resolved package: the intersection of their individual bounds. |
| `pubspec.lock` | `sdks.flutter` | The Flutter SDK bound shared by every resolved package. |
| `pubspec.yaml` | `environment.sdk` | The Dart SDK bound the project itself declares. |
| `pubspec.yaml` | `environment.flutter` | The Flutter SDK bound the project itself declares. |

A `dart@x` target is checked against the Dart bounds and a `flutter@x` target against the Flutter bounds; the other runtime's bounds are not consulted. A target outside a `pubspec.lock` bound is a `blocker` with subject `resolved package set` and `kind: "lockfile"`: the resolved set would not install. A target outside a `pubspec.yaml` bound is a `blocker` with subject `environment.sdk` or `environment.flutter` and `kind: "manifest"`. When neither file records a bound for the target runtime, one `unknown` issue is reported; it names the absent `sdks` key as evidence.

A target with fewer than three components is checked as `x.0.0` or `x.y.0`, so `dart@3.5` is checked as `3.5.0`.

Version syntax: a constraint is `any` or one or more space-joined terms, each `^`, `>=`, `<=`, `>`, `<`, or a bare version followed by `x.y.z` and an optional pre-release or build suffix. Caret follows pub's rules: `^1.2.3` means `>=1.2.3 <2.0.0`, `^0.2.3` means `>=0.2.3 <0.3.0`, and `^0.0.3` means `>=0.0.3 <0.0.4`. A bound the parser cannot read (a template, `||` range, or missing components) is treated as missing evidence, so the answer is `unknown` rather than `ready`.

The parsers are the ones the Dart detector uses: `src/detectors/dart/parse-pubspec-lock.ts` and `parse-pubspec.ts`.

```bash
node dist/tools/examples.js upgrade/dart-sdk upgrade-check --to dart@3.5
```

```text
blocked: dart@3.5 (1 blocker, 0 warnings, 0 unknown)
pubspec.lock:12  resolved package set  The resolved package set requires Dart >=3.6.0 <4.0.0, which excludes 3.5.0.  [lockfile >=3.6.0 <4.0.0]
```

## npm lockfile

Runtime: `nodejs`. Applies when `package-lock.json` or `npm-shrinkwrap.json` exists with `lockfileVersion` 2 or 3. A version 1 lockfile is reported as one `unknown` issue because it does not record package `engines`.

- Files read: `package-lock.json` and `npm-shrinkwrap.json`. Each issue names the file it came from.
- Fields read: `lockfileVersion`; for each `packages["node_modules/..."]` entry, `version`, `engines.node`, `dev`, and `devOptional`.
- Version syntax: semver ranges in `engines.node`, tested with `semver.satisfies` and `includePrerelease: false`. A bare target major such as `22` is tested as `22.0.0`; the bundled lifecycle data does not list per-minor Node.js releases.
- Levels: `blocker` for a production dependency whose range excludes the target; `warning` for an entry marked `dev: true` or `devOptional: true`; `unknown` for an `engines.node` value that is not a valid semver range.
- Evidence: `engines.node: <range as written>`, at the line of the `engines` key.
- Deduplication: identical name, version, and range across nested paths keep the first path.

```bash
node dist/tools/examples.js upgrade/npm-lock upgrade-check --to nodejs@22
```

```text
nodejs@22: blocked (1 blockers, 0 warnings, 0 unknown)
package-lock.json:16  sharp@0.30.7  sharp@0.30.7 declares engines.node ">=14.0.0 <17", which excludes Node.js 22.  [lockfile: engines.node: >=14.0.0 <17]
```

## pnpm lockfile

Runtime: `nodejs`. Applies when `pnpm-lock.yaml` exists with `lockfileVersion` 6.x or 9.x.

- Files read: `pnpm-lock.yaml`. In 6.x, `packages` entries carry `engines`, `dev`, and `devOptional`. In 9.x, `engines` lives under `packages`, while the dev flag is resolved from `importers` and `snapshots`.
- Fields read: `lockfileVersion`; for each `packages` entry, the key (`<name>@<version>`, with an optional leading `/` and an optional peer suffix) and `engines.node`; in 6.x, `dev` and `devOptional`; in 9.x, the `dependencies`, `optionalDependencies`, and `devDependencies` of every `importers` entry, and the `dependencies` and `optionalDependencies` of every `snapshots` entry.
- Version syntax: semver ranges in `engines.node`, tested with `semver.satisfies` and `includePrerelease: false`. A bare target major such as `22` is tested as `22.0.0`; the bundled lifecycle data does not list per-minor Node.js releases.
- Levels: `blocker` for a production dependency whose range excludes the target; `warning` for a dev dependency (`dev: true` or `devOptional: true` in 6.x, or reachable only from a dev dependency in 9.x); `unknown` for an `engines.node` value that is not a valid semver range.
- Evidence: `engines.node: <range as written>`, at the line of the `engines` key.
- Deduplication: identical name, version, and range across peer variants keep the first line.

## Poetry (`poetry.lock`)

Applies when `poetry.lock` exists. Runtime: `python`.

Files and fields it reads:

- Every `[[package]]` entry in `poetry.lock`: `name`, `version`, `python-versions`, and `category` (Poetry 1.1) or `groups` (later Poetry versions). Both group forms are handled.
- The project's own `[tool.poetry.dependencies]` `python` constraint in `pyproject.toml`, as a string or as a table with `version`.

Version syntax it understands: PEP 440 specifiers `>=`, `<=`, `<`, `>`, `==` (including `.*`), `!=`, and `~=`, joined with commas for AND; Poetry's `^` (caret), `~` (tilde), and `||` (OR) forms; and `*`, which matches every version. Comparisons follow PEP 440 ordering, including pre-releases, post-releases, development releases, and epochs.

What it reports:

- `blocker` for a main-group package whose `python-versions` excludes the target release, and for a project-level `python` constraint that excludes it.
- `warning` for a package in the `dev` or any other non-main group whose `python-versions` excludes the target.
- `unknown` for a `python-versions` value or project constraint the matcher cannot parse.

Evidence is the value as written: `python-versions: <value>` with `kind: "lockfile"` at that field's line, or `python: <value>` with `kind: "manifest"` at the `python` line in `pyproject.toml`. The subject is `<name>@<version>`, or `python` for the project constraint.

Example:

```text
blocked
poetry.lock:12  requests@2.28.0  requests@2.28.0 declares python-versions ">=3.7,<3.11", which excludes Python 3.13.  [lockfile: python-versions: >=3.7,<3.11]
pyproject.toml:9  python  The project's [tool.poetry.dependencies] python constraint ">=3.8,<3.12" excludes Python 3.13.  [manifest: python: >=3.8,<3.12]
```

## uv and PDM (`uv.lock`, `pdm.lock`)

Applies when `uv.lock` or `pdm.lock` exists. Runtime: `python`. Each issue names the file it came from.

Files and fields it reads:

- The top-level `requires-python` in `uv.lock`: the project's own range.
- Every `[[package]]` entry in `uv.lock`: `name`, `version`, `resolution-markers`, `sdist`, and the python and ABI tags of each wheel name.
- The `[metadata]` `requires_python` in `pdm.lock`, when present.
- Every `[[package]]` entry in `pdm.lock`: `name`, `version`, `requires_python`, and `groups`.

Version syntax it understands: PEP 440 specifiers `>=`, `<=`, `<`, `>`, `==` (including `.*`), `!=`, and `~=`, joined with commas for AND, plus `||` alternatives; the same comparisons in `resolution-markers` clauses on `python_version` and `python_full_version`; and wheel python tags that name a minor version (`cp39`, `py38`, `cp39-abi3`). A wheel tagged `abi3` allows every release at or above its tag. Markers that mention other variables (`sys_platform`, `platform_system`) do not bound Python.

What it reports:

- `blocker` when the project's own range (top-level `requires-python` in `uv.lock`, `[metadata]` `requires_python` in `pdm.lock`) excludes the target, when a uv package has no resolution that admits the target, and when a `default`-group PDM package's `requires_python` excludes it.
- `warning` for a PDM package in the `dev` or any other non-`default` group whose `requires_python` excludes the target. `uv.lock` has no groups.
- `unknown` for a range, marker, or wheel tag the matcher cannot parse, and for an invalid TOML file.

A uv package is reported only when every one of its resolutions states a Python bound and every bound excludes the target. Wheel tags are read only when the entry has no sdist, and a package with no bound at all is reported as nothing: wheel availability is never treated as evidence.

Evidence is the value as written: `requires-python: <range>` or `requires_python: <range>` for the project range, `resolution-markers: <marker>` for an excluding resolution, `wheels: <python tag>-<ABI tag>, ...` for version-specific wheels, and `requires_python: <range>` for a PDM package, all with `kind: "lockfile"` at that field's line. The subject is `<name>@<version>`, or `python` for the project range.

Example:

```text
python@3.13: blocked (1 blockers, 1 warnings, 0 unknown)
uv.lock:7  twisted@24.3.0  twisted@24.3.0 resolves only for Python versions matching "python_full_version < '3.13'", which excludes Python 3.13.  [lockfile: resolution-markers: python_full_version < '3.13']
pdm.lock:4  black@24.3.0  black@24.3.0 is in the dev group and its requires_python ">=3.9,<3.13" excludes Python 3.13.  [lockfile: requires_python: >=3.9,<3.13]
```

## Python standard library

Applies when the repository has at least one Python source file.

- **Reads:** every `.py` file the usage analysis reads (the same traversal as a scan: `.git`, virtual environments, build output, and dependency directories are skipped, as are files over 1 MB) and the module-import and symbol rules in `registry/python.json` whose package URL is `pkg:generic/python`.
- **Version syntax:** PEP 440 ranges from the rule's `vers`, compared with the target release, as in `python@3.13`.
- **Reports:** every `import module` and `from module import name` of a module removed by the target, and every use of a removed or deprecated function that the symbol rules describe. A `removed` rule whose range includes the target is a blocker; a `deprecated` rule whose range includes the target is a warning. Each issue is one usage location; the subject is the module or symbol and the evidence is the rule id.
- **`unknown`:** this analyzer reports none. A rule whose range does not include the target, or a target release the PEP 440 comparison cannot read, produces no issue.

## Node.js core APIs

Analyzer id `node-apis`; runtime `nodejs`. Applies when the repository's JavaScript or TypeScript source uses an API described by a `nodejs.symbol.*` rule, found with the same parser-backed usage analysis the npm detector uses.

- **Reads:** every JavaScript and TypeScript source file the usage analysis reads (the same traversal as a scan: `.git`, dependency and build directories, and files over 1 MB are skipped) and the `nodejs.symbol.*` rules in `registry/nodejs.json` whose package URL is `pkg:generic/nodejs`.
- **Version syntax:** semver ranges from the rule's `vers`, compared with the target release, as in `nodejs@24`. A rule whose range does not include the target produces no issue.
- **Reports:** every use of an API the target removed or deprecated. A `removed` rule whose range includes the target is a `blocker`; a `deprecated` rule whose range includes the target is a `warning`. Each issue is one usage location; the subject is the API name and the evidence is the rule id.
- **Levels come from rule data only:** the `event` and `vers` fields decide. Summaries and titles are never parsed for versions, so a rule that mentions a runtime-deprecation version in its text counts as a warning from that version only when the range is encoded in `vers`.
- **`unknown`:** this analyzer reports none. A target release the semver comparison cannot read, or a source file without a matched symbol, produces no issue.

The removal versions in the registry are sourced to the official [Node.js deprecations page](https://nodejs.org/api/deprecations.html).

## Target lifecycle

Analyzer id `target-lifecycle`; runtimes `nodejs`, `python`, `go`, `java`, `dotnet`, `ruby`, `php`, `dart`. Applies when the repository pins one of these runtimes in a file this analyzer can read; a repository without any such pin is not judged by it.

**The target itself**

The target release is looked up with `lookupProduct` against the bundled registry, and only the runtime's own lifecycle rules (`nodejs.runtime.*`, `python.runtime.*`, `go.runtime.*`, `java.jdk.*`, `dotnet.runtime.*`, `ruby.runtime.*`, `php.runtime.*`, `dart.sdk.*`) decide; module or platform rules that share the product never flag the release itself.

- A target that is end-of-life, removed, or out of support — or whose dated end has already passed — is a `blocker`: "the target itself is end-of-life; choose <newest supported line>". The suggested line is the rule's `replacement` from the bundled data; nothing is ever fetched.
- A target whose dated end falls within 180 days of the day checked is a `warning` with the deadline and the same suggestion.
- The evidence is the rule id; the issue is located at the repository's first pin of that runtime, so the report shows where the choice has to be made.

**Files that must change**

Every pin of the target runtime that differs from the target is listed as a `warning` with subject `pin to update`, at its exact path and line; a pin that already names the target is not listed.

- **Reads:** `.nvmrc`, `.node-version`, `.python-version` (version line, moving names such as `lts/*` are skipped); `.ruby-version`, `.php-version`, `.java-version`, and `global.json` through the existing runtime-pin parsers; every `.tool-versions` line of a known tool (a `path:` or `ref:` entry names no version and is skipped); `FROM` images of runtime repositories in any `Dockerfile`, `Containerfile`, or named variant (depth- and count-bounded walk, symlinks and build directories skipped); and `actions/setup-{node,python,ruby,java,dotnet,go,dart}` version inputs in `.github/workflows/*.yml|yaml`, scalar or list, parsed as data and never evaluated.
- **Version syntax:** `semver.coerce` normalizes what a pin stands for (`20`, `v20.11`, `18.19.0`, `node:20-alpine`, `8.0.x`, `temurin-22`); the comparison respects the precision the target was written with, so the target `24` matches any `24.x` pin while the target `24.12` requires that release line.
- **`unknown`:** this analyzer reports none. A runtime with no pins in the repository simply does not apply, and a target the bundled data does not flag produces only the pin list.

```bash
evergreen upgrade-check --to nodejs@18 tests/fixtures/upgrade/target-lifecycle/example
```

The example repository pins Node.js 20 in `.nvmrc`, a `Dockerfile`, and `.tool-versions`, so the end-of-life target is blocked with the suggestion and all three pins are listed. See [tests/fixtures/upgrade/target-lifecycle/example](../tests/fixtures/upgrade/target-lifecycle/example).
