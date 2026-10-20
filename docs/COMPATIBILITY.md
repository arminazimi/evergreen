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

## Ecosystem coverage

<!-- coverage-matrix:start -->
| Detector ecosystem | Status | Coverage |
| --- | --- | --- |
| CI runner images | Experimental | `pool.vmImage` in Azure Pipelines is matched against retirement rules; GitLab `image`/`services` and CircleCI images are listed as unclassified references, not judged. |
| Container base images | Experimental | `FROM` lines in Dockerfiles and Containerfiles and `services.*.image` in Compose files, for Docker Hub official images with a vendor lifecycle. See [Container base images](detectors/container.md). |
| .NET | Beta | `global.json`, project files, `Directory.Build.props`, `Directory.Packages.props`, and `packages.lock.json`, for .NET release lines past end of support and deprecated NuGet packages. See [.NET](detectors/dotnet.md). |
| Go | Experimental | `go` and `toolchain` directives in `go.mod` and `go.work`, and direct `require` entries, for Go release lines past end of support. See [Go](detectors/go.md). |
| Java and Kotlin (JVM) | Experimental | JDK declarations in `pom.xml`, Gradle build scripts, `.java-version`, `.sdkmanrc`, and `.tool-versions`, and direct Maven dependencies, for non-LTS JDK releases past end of support and moved artifacts. See [Java and Kotlin](detectors/java.md). |
| Kubernetes APIs | Experimental | The literal `apiVersion` and `kind` in YAML manifests, Helm chart templates, and kustomization patches, for API versions the Kubernetes project says are no longer served. See [Kubernetes APIs](detectors/kubernetes.md). |
| GitHub Actions | Supported | Selected first-party Action lifecycle rules and exact workflow locations. |
| Node.js and npm | Supported | Runtime declarations, direct dependencies, lockfiles, and supported source usages. |
| PHP | Experimental | Pinned runtime declarations in `.php-version`, `.tool-versions`, `composer.json`, and `composer.lock`, for PHP release lines past end of support and abandoned Composer packages. |
| Python | Supported | Runtime declarations, direct dependencies, common lockfiles, and supported source usages. |
| Ruby | Experimental | Pinned runtime declarations in `.ruby-version`, `.tool-versions`, the Gemfile `ruby` directive, and Gemfile.lock `RUBY VERSION`, plus direct gems, for Ruby release lines past end of support and yanked gems. Gem rules can list source usages in Ruby files. |
| Rust | Experimental | The pinned toolchain in `rust-toolchain(.toml)` and direct dependencies in `Cargo.toml` and `Cargo.lock`, for toolchains older than the newest stable release and unmaintained crates. See [Rust](detectors/rust.md). |
| Other language and platform ecosystems | Unsupported | Report the limitation; do not infer lifecycle status without a detector. |
<!-- coverage-matrix:end -->

`Supported` means the combination is part of the documented product contract.
`Experimental` means it is usable but lacks a complete release gate or stable
distribution package. For detectors, `Experimental`, `Beta`, and `Supported`
have the meanings and the evidence requirements in
[decision 0013](decisions/0013-detector-maturity.md), and the level of each is
recorded in `benchmarks/thresholds.json`. `Unsupported` means Evergreen does not currently claim the
combination works.

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
