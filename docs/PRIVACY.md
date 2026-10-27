# Evergreen privacy

Evergreen analyzes software repositories on the user's computer. The Codex and Claude plugins start a local stdio MCP server and do not send repository contents to an Evergreen-operated service. Evergreen does not require an Evergreen account, collect analytics, use advertising identifiers, or sell personal data.

The local tools read supported manifests, lockfiles, workflow files, runtime-version files, and relevant source excerpts from the repository path the user authorizes. Results can contain file paths and short source excerpts. The host application receives those results, so its privacy policy and the user's workspace settings also apply.

The plugin launches the exact published `evergreen-deprecation` npm version recorded in its manifest. The package manager may contact the configured npm registry to obtain that package. Lifecycle evidence links are returned as references; Evergreen does not open them automatically.

Scans use no network. The one exception is `evergreen data update`, which you run yourself to fetch newer, signed lifecycle rules from the project's public GitHub releases. It sends nothing about you or your repository (a request for a public release list and two public files, which the host can see as it can any download), verifies the signature before using the data, and falls back to the rules shipped with the release if verification fails. See [Lifecycle data](DATA.md).

## Command and surface access

Supply-chain scanners correctly report that the published package can read files, read environment variables, spawn processes (including `git`), and reach the network. Those capabilities are real; they are not used by every command. This table is the contract for what each surface actually does. "Scan path" means the repository (or paths) you pass on the command line or to a tool. Nothing here uploads repository contents to an Evergreen service.

| Surface / command | Filesystem | Environment | Child process | Network |
| --- | --- | --- | --- | --- |
| **CLI `scan`**, `forecast`, `explain`, `context`, `renovate-preset` | Reads the scan path (manifests, lockfiles, workflows, source). Optional writes only when you ask: `--write-status` → `EVERGREEN_STATUS.md`; `--baseline` reads a baseline file | `EVERGREEN_DATA_VERSION` (pin bundled/cached rules); `EVERGREEN_DATA_DIR` / `XDG_CACHE_HOME` / `HOME` for cached data; `--interactive` uses `VISUAL` or `EDITOR` to open a finding | `--interactive` may spawn your editor. No `git`, no package manager | None |
| **CLI `check`** | None (rules from the package or local data cache) | Same data-pin and cache variables as `scan`; optional `EVERGREEN_USAGE_LOG` appends one local line | None | None |
| **CLI `usage`** | Reads the local usage-log file when logging was enabled | `EVERGREEN_USAGE_LOG`, or `--file` | None | None |
| **CLI `baseline`** | Reads the scan path; writes `.evergreen-baseline.json` (or `--output`) | Same data-pin and cache variables as `scan` | None | None |
| **CLI `report-issue`** | Reads the scan path and a few lines of the declaring file; optional `--output` write | Same data-pin and cache variables as `scan` | None | None (prints Markdown; never opens an issue) |
| **CLI `rollup`** | Reads the saved report JSON files you name (and optional `--owners` file) | None beyond process defaults | None | None |
| **CLI `sbom enrich`**, `export` | Reads the SBOM or bundled/cached lifecycle data; prints to stdout | Data-pin and cache variables as above | None | None |
| **CLI `capabilities`**, `completions`, `--help`, `--version` | None (packaged constants / scripts) | None | None | None |
| **CLI `data status`** | Reads the local data cache and bundled rules | `EVERGREEN_DATA_DIR` / cache home variables | None | None |
| **CLI `data update`** | Writes verified bundles under the local data cache | `EVERGREEN_DATA_URL` (optional mirror); `HTTP(S)_PROXY` / `http(s)_proxy`; cache home variables. May relaunch Node with `NODE_USE_ENV_PROXY` when a proxy is set | May re-exec the same Node process so proxy env is honored | **Yes** — public GitHub release list plus the signed bundle and signature only. Sends no repository data |
| **CLI `diff`** | Reads git objects into a temp directory, then scans them; leaves the working tree alone | Same data-pin and cache variables as `scan` | Runs local `git archive` and `tar` (no remotes) | None |
| **CLI `doctor`** | Reads the install layout and, for the path argument, local project markers | Detects CI via `GITHUB_ACTIONS` / `GITLAB_CI` and related workspace variables | With `--system`, runs fixed version commands (`node`, `python3`, `go`, …) with a short timeout | None |
| **CLI `guard`** | None for the check itself | Same as `check` for the preflight | After a passing check, spawns the package manager you named (`npm`, `pnpm`, `yarn`, `bun`, …) with your arguments | Only whatever that package manager does after Evergreen exits the check |
| **CLI `fix`** | Reads the scan path. Default: prints patches to stdout (no write). `--branch`: applies and commits on a new local branch | Same data-pin and cache variables as `scan` | `--branch` runs local `git` (`checkout`, `apply`, `add`, `commit`); never `push` | None |
| **CLI `init --agents`**, `setup` | Reads/writes agent instruction files in the scan path (`AGENTS.md`, `CLAUDE.md`, host rule files, …) | None beyond process defaults | None | None |
| **CLI `init --hooks`** | Reads/writes `.git/hooks/pre-push` (or the path `git` reports) | None beyond process defaults | Runs `git rev-parse` to locate hooks | None |
| **CLI `init --personal`** | Writes `~/.config/evergreen/` (or `XDG_CONFIG_HOME`) config and a global pre-push hook | `HOME` / `USERPROFILE`, `XDG_CONFIG_HOME` | Runs `git config --global core.hooksPath` (after confirmation unless `--yes`) | None |
| **CLI `watch`** | Reads registered projects (same as `scan`); reads/writes `watch.json` under the personal config directory | `HOME` / `XDG_CONFIG_HOME` for state location; same data-pin variables when scanning | None | None |
| **CLI `new-detector`** | Contributor checkout only: scaffolds detector files under the repo | None | None | None |
| **CLI `mcp`** / **`evergreen-mcp`** | Same reads as the tools below; no repository writes | Optional `EVERGREEN_USAGE_LOG` for `check_dependency`; data-pin and cache variables | None (stdio only; no shell for migrations) | None |
| **MCP tools** (`scan_repository`, `list_deprecations`, `explain_deprecation`, `create_migration_context`, `verify_migration`, `check_dependency`) | Read the authorized repository path (except `check_dependency`, which reads no repository). Session findings stay in memory | Same as MCP process above | None — `verify_migration` returns suggested commands and does not run them | None |
| **`evergreen-lsp`** | Reads/scans workspace folders; may write open buffer text into a private temp directory for analysis | None beyond process defaults | None | None (stdio language server) |
| **GitHub Action** | Reads `path` (default workspace); may write report/SARIF/badge under `RUNNER_TEMP` when upload inputs are on; reads `GITHUB_EVENT_PATH` for PR metadata | Action inputs as `INPUT_*`, plus `GITHUB_WORKSPACE`, `GITHUB_OUTPUT`, `GITHUB_STEP_SUMMARY`, `GITHUB_REPOSITORY`, `GITHUB_API_URL`, `RUNNER_TEMP`, and `INPUT_GITHUB-TOKEN` when commenting | None from Evergreen itself | **Only when `pr-comment: true`**: GitHub API upsert of one PR comment after the scan. The scan itself uses no network |
| **Agent Skill / Codex & Claude plugins** | No direct I/O: they launch the local MCP server or tell the host to run CLI commands under the host's permission model | Host may set env when spawning MCP/CLI | Host may spawn `npx` / Node to start MCP | Package install may hit the npm registry; analysis stays local |

Notes that apply across rows:

- Detectors never call the network and never execute repository code. Repository contents are parsed as data.
- Evidence URLs in findings are references only; Evergreen does not open them.
- Maintainer-only scripts under `tools/` (importers, source checks, adoption metrics) can use the network and optional `GITHUB_TOKEN` / `GH_TOKEN`. They are not part of the published CLI scan path and are not in the table above.
- Socket and similar scanners flag the *capability* (filesystem, env, child process, URL strings) because the code exists in the tarball. Use this table to see which command exercises which capability.

## Local usage log

By default Evergreen records nothing about what you or an agent checked. If you set `EVERGREEN_USAGE_LOG=1` (or to a file path), each `evergreen check` and each `check_dependency` call appends one line to a file on your machine: the time, the package URL and version checked, the result, its severity, and the matching rule IDs. It records no repository path, file content, user name, or prompt. `evergreen usage` reads that file and prints how many checks ran and which packages were flagged as `affected` (what the guardrail told an agent to avoid; Evergreen cannot itself stop an edit). **Nothing in this log is sent anywhere: Evergreen has no code that uploads it, and the summary command reads only the local file.** Delete the file to erase it; unset the variable to stop recording. Because the file lives on disk, anything that can read your files can read it.

Evergreen's tools do not edit repository files, execute suggested migration commands, open a network listener, or request credentials — except the explicit write and process rows in the table above (`baseline`, `--write-status`, `init` / `setup`, `fix --branch`, `guard`'s package manager, and similar). Users can disable or remove the plugin at any time. Questions can be reported through [GitHub Issues](https://github.com/arminazimi/evergreen/issues).
