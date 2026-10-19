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
| .NET | Experimental | `global.json`, project files, `Directory.Build.props`, `Directory.Packages.props`, and `packages.lock.json`, for .NET release lines past end of support and deprecated NuGet packages. See [.NET](detectors/dotnet.md). |
| Go | Experimental | `go` and `toolchain` directives in `go.mod` and `go.work`, and direct `require` entries, for Go release lines past end of support. See [Go](detectors/go.md). |
| Java and Kotlin (JVM) | Experimental | JDK declarations in `pom.xml`, Gradle build scripts, `.java-version`, `.sdkmanrc`, and `.tool-versions`, and direct Maven dependencies, for non-LTS JDK releases past end of support and moved artifacts. See [Java and Kotlin](detectors/java.md). |
| Kubernetes APIs | Experimental | The literal `apiVersion` and `kind` in YAML manifests, Helm chart templates, and kustomization patches, for API versions the Kubernetes project says are no longer served. See [Kubernetes APIs](detectors/kubernetes.md). |
| GitHub Actions | Supported | Selected first-party Action lifecycle rules and exact workflow locations. |
| Node.js and npm | Supported | Runtime declarations, direct dependencies, lockfiles, and supported source usages. |
| Python | Supported | Runtime declarations, direct dependencies, common lockfiles, and supported source usages. |
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
