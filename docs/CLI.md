# CLI reference

`evergreen --help` prints every command with an example. This page is the readable version of the same reference: what each command does, which flags it takes, and the exit codes a script or agent can rely on. Passing `--help` anywhere prints the command list again.

Every command runs locally. Scans read repository files and bundled lifecycle data, and no scan uses the network. Only `data update` and the Skill install in `setup --yes` download anything; see [Privacy](PRIVACY.md).

## Global options

| Option | What it does |
| --- | --- |
| `-h`, `--help` | Print the command list and exit `0`. Running `evergreen` with no arguments prints the same text. |
| `-v`, `--version` | Print the package version and exit `0`. |
| `--debug` | On an unexpected failure (`internal`, exit `5`), print the stack trace to stderr. |
| `--json` | Print a machine-readable document where the command supports one. Same as `--format json` for `scan`, `check`, and `forecast`. |
| `--format <name>` | Choose the output format. `scan` accepts all thirteen formats below; `forecast` accepts `text`, `json`, and `mermaid`; `check` accepts `text` and `json`; `rollup` accepts `json` and `html`. |
| `--data-version <version>` | Pin the lifecycle data for this run, for example `2026.10.01` or `bundled`. Same as `EVERGREEN_DATA_VERSION`. Pinned data is read from disk; nothing is downloaded. |
| `--no-cache` | Bypass the scan cache and re-read every file. Available on `scan`. Same as `EVERGREEN_NO_CACHE=1`. |

## Scanning and reporting

### `scan`

```bash
evergreen scan [path...] [--json | --format <format>]
```

Finds lifecycle risks in a repository and prints each one with its severity, exact file and line, replacement, and evidence source. Results are cached locally; the scan itself is read-only.

| Flag | What it does |
| --- | --- |
| `[path...]` | Directory to scan, default `.`. Several paths scan several projects and report per-project and combined counts. With several paths only `--json` and `--format text\|json` are accepted, and `--baseline` and `--write-status` are rejected. |
| `--format <format>` | Output format; see the table below. |
| `--json` | Same as `--format json`. |
| `--demo` | Scan an in-memory demo project that always has findings. Takes no path and cannot be combined with `--all`, `--baseline`, or `--write-status`. |
| `--fail-on <severity\|none>` | Exit `1` when at least one finding is at or above this severity. Severities, lowest to highest: `info`, `low`, `medium`, `high`, `critical`. Default: the config's `failOn`, else `none`. |
| `--all <dir>` | Scan every Git repository found under `<dir>`. |
| `--ignore <path>` | Skip a path or glob during the scan. Repeatable; overrides the config's `ignore` list. |
| `--only <selector>` | Keep only findings for an ecosystem or rule-id prefix, such as `npm` or `npm.package.request`. Repeatable. |
| `--exclude <selector>` | Drop findings for an ecosystem or rule-id prefix. Repeatable. |
| `--baseline <file>` | Compare against a baseline of accepted findings. Repeatable. |
| `--baseline-warn-days <n>` | Warn about suppressions that expire within `n` days. Default `14`, range `0`–`365`. |
| `--on-expired <resurface\|fail>` | What a suppression past its `expires` date does: `resurface` the finding (default) or fail with exit `1`. |
| `--as-of <YYYY-MM-DD>` | Evaluate lifecycle status as of this date instead of today. |
| `--today <YYYY-MM-DD>` | Alias for `--as-of`. |
| `--min-support-days <n>` | Warn on lines whose support ends within `n` days. Range `0`–`3650`. |
| `--write-status` | Write `EVERGREEN_STATUS.md` at the root of the scanned repository. |
| `--interactive` | Browse findings and open one in `$EDITOR`; falls back to plain text when stdout is not a terminal. |
| `--by-owner` | Group findings by `CODEOWNERS` owner; files with no owner are listed as unowned. Supports `text` and `json` only. |
| `--no-cache` | Re-scan every file instead of using the cache. |

The baseline, date, and ignore options also apply to `explain`, `context`, and `report-issue`, which scan the repository before they look up a finding.

| `--format` | Output |
| --- | --- |
| `text` | Human-readable summary, most urgent first. The default. |
| `json` | Versioned scan document that conforms to [`schemas/scan.v1.schema.json`](../schemas/scan.v1.schema.json). |
| `markdown` | Paste-ready report with a table and evidence links. |
| `junit` | JUnit XML with one failed test case per finding. |
| `sarif` | SARIF 2.1.0 for GitHub code scanning. |
| `rdjson` | reviewdog diagnostic JSON for `reviewdog -f=rdjson`. |
| `codequality` | GitLab Code Quality JSON. |
| `compact` | One line per finding, for an agent's context window. |
| `html` | Self-contained report with the embedded JSON result and the forecast. |
| `slack` | Slack incoming-webhook payload. |
| `teams` | Microsoft Teams Adaptive Card. |
| `webhook` | Generic JSON payload with severity counts and every finding. |
| `mermaid` | Fenced Mermaid Gantt chart of support windows, for READMEs, issues, and pull request comments. |

The `mermaid` format prints a fenced `mermaid` block that GitHub renders natively. Each section is an ecosystem and each bar runs from the observation day (`--as-of`, or today) to the deadline. A subject that has already ended is a `crit` milestone at its deadline; one that ends within 30 days is a `crit` bar. A `today` milestone follows `--as-of`. The chart draws at most 40 bars; a final line counts the rest, and `--format json` still lists every finding. [Showcase](SHOWCASE.md#mermaid-support-windows) has a complete example.

### `drift`

```bash
evergreen drift [path] [--json] [--check] [--runtime <id>] [--align <release>]
```

Reports every runtime version a repository states, at its exact `path:line`, and whether the values agree. It reads repository files only: no runtime is executed and no network is used. `--align` prints a unified diff; nothing is written.

| Flag | What it does |
| --- | --- |
| `[path]` | Repository root. Default `.`. |
| `--json` | Print the drift document, which conforms to [`schemas/drift.v1.schema.json`](../schemas/drift.v1.schema.json). |
| `--check` | Exit `1` when a runtime's pins disagree or a floor is above the lowest pinned release. |
| `--runtime <id>` | Read one runtime only, such as `ruby`. |
| `--align <release>` | Print a patch that makes the alignable pins select `release`, such as `3.4`. Requires `--runtime`, refuses floors and ranges, and never writes a file. |

[Drift](DRIFT.md) lists the sources each runtime collector reads, its release granularity, and what it reports as unresolved.

### `forecast`

```bash
evergreen forecast [path] [--months <n>] [--as-of <YYYY-MM-DD>] [--svg [--animate] | --timeline | --json]
evergreen forecast [path] [--months <n>] [--as-of <YYYY-MM-DD>] [--timeline | --json | --format mermaid]
```

Lists what reaches end of life next, grouped by month, from the current scan.

| Flag | What it does |
| --- | --- |
| `--months <n>` | How many months ahead to look. Whole number from `1` to `36`; default `12`. |
| `--as-of <YYYY-MM-DD>` | Treat this date as today. |
| `--timeline` | Draw the forecast as a terminal timeline instead of a list. Cannot be combined with `--json` or `--svg`. |
| `--svg` | Print a self-contained SVG timeline for a README or a slide. Cannot be combined with `--timeline` or `--json`. |
| `--animate` | With `--svg`, grow a bar from today to each event in date order and pulse the today marker twice with CSS. `prefers-reduced-motion: reduce` shows the final frame immediately. |
| `--timeline` | Draw the forecast as a terminal timeline instead of a list. Cannot be combined with `--json` or `--format mermaid`. |
| `--format mermaid` | Print a fenced Mermaid Gantt chart of the dated events, grouped by ecosystem. |
| `--json` | Print the forecast document. |

The SVG has no script and no external references, so it is safe to commit and embed as an image. [Showcase](SHOWCASE.md) covers embedding it in a README and refreshing it on a schedule.

### `countdown`

```bash
evergreen countdown [path] [--as-of <YYYY-MM-DD>] [--limit <n>] [--json] [--once] [--no-animation]
```

Prints a live countdown to every dated lifecycle deadline that affects the repository: one row per subject, soonest first. Each row carries a bar scaled to the remaining time in a two-year window and the time left until 00:00 UTC on the deadline.

| Flag | What it does |
| --- | --- |
| `--as-of <YYYY-MM-DD>` | Count down from 00:00 UTC on this date instead of now. |
| `--limit <n>` | How many deadlines to show. Whole number of at least `1`; default `10`. |
| `--json` | Print the rows in an `evergreen.countdown.v1` document, with `subject`, `deadline`, `remainingSeconds`, `ruleId`, and `location` for each. |
| `--once` | Print one frame and exit. |
| `--no-animation` | Print one static frame instead of animating on a terminal. |

Bars are green while more than 180 days remain, yellow from 30 to 180, red under 30, and dim once the deadline has passed. The command looks 24 months ahead, the span a full bar represents. On a terminal the frame redraws once per second for six seconds and stops on the final frame; Ctrl-C clears the timer and exits `130`. Off a terminal, with `--once`, or with `--no-animation` it prints one static frame. `--json` always prints one document, and its deadline dates match `forecast --json` for the same `--as-of`.

### `status-card`

```bash
evergreen status-card [path] [--name <label>]
```

Prints a static SVG summary of the scan: finding counts, the next end of life, and the age of the lifecycle data.

| Flag | What it does |
| --- | --- |
| `--name <label>` | Repository label shown on the card. Defaults to the directory name. |

### `glance`

```bash
evergreen glance [path] [--as-of <YYYY-MM-DD>] [--json]
```

Prints a one-screen summary of the repository's lifecycle state, laid out like `neofetch`: the Evergreen mark on the left and the facts on the right — the repository name (from the git remote, or the folder), every detected ecosystem with its maturity level, findings by severity as colored blocks, the next deadline, the oldest ended item, and the lifecycle data version and age. The severity counts match `scan --json` for the same path.

| Flag | What it does |
| --- | --- |
| `[path]` | Repository path. Default `.`. |
| `--as-of <YYYY-MM-DD>` | Read the state as of this date instead of today. |
| `--json` | Print the facts as an `evergreen.glance.v1` document, without the mark. |

Below 80 terminal columns the mark is dropped and the facts keep the full width. On a terminal the severity blocks are colored; `NO_COLOR` turns that off. [Showcase](SHOWCASE.md) shows the card and [docs/demos/glance.tape](demos/glance.tape) records it.

### `lookup`

```bash
evergreen lookup <product> [version] [--json]
```

Resolves a product and optional version against the bundled lifecycle rules and prints the support status, end-of-life date, and evidence. A name made of several words is allowed, as in `evergreen lookup node 18`. An unknown product exits `2` with suggestions.

| Flag | What it does |
| --- | --- |
| `--json` | Print the structured lookup result. |

### `drift`

```bash
evergreen drift [path] [--json] [--check] [--runtime <id>] [--align <release>]
```

Reports every place a repository states a runtime version and whether those values select the same release line. Each pin carries its file and line, the source it came from, the value as written, and the release it resolves to offline; a floor above the lowest pin is reported as a floor conflict. Nothing is written. See [Drift](DRIFT.md) for the sources and granularity of each runtime.

| Flag | What it does |
| --- | --- |
| `[path]` | Repository path. Default `.`. |
| `--json` | Print the `evergreen.drift.v1` document defined by [`schemas/drift.v1.schema.json`](../schemas/drift.v1.schema.json). |
| `--check` | Exit `1` when any runtime drifted or has a floor conflict. |
| `--runtime <id>` | Report one runtime only. |
| `--align <release>` | Print a unified diff that makes the pins Evergreen understands select `release`; requires `--runtime`. Refused pins are listed on stderr, and no file is written. |
### `upgrade-check`
evergreen upgrade-check --to <runtime@version> [path] [--json]
Answers from files already in the repository whether the project can move to a target runtime. It reads lockfiles and manifests only: no package manager runs, nothing is installed, and nothing is fetched.
| `--to <runtime@version>` | Required. Target runtime and release, for example `php@8.4` or `nodejs@22`. `node`, `py`, and `golang` are accepted as runtime aliases. |
| `[path]` | Repository root, default `.`. |
| `--json` | Print the `evergreen.upgrade.v1` document that conforms to [`schemas/upgrade.v1.schema.json`](../schemas/upgrade.v1.schema.json). |
The text output starts with the verdict, then lists every blocker, warning, and unknown as `path:line  subject  reason  [evidence]`. Exit `1` when the verdict is `blocked`, `0` for `ready` and `unknown`, and `2` for bad input. An `unknown` verdict means no analyzer found evidence for that runtime in this repository; it is not a statement that the upgrade is safe. [Upgrade check](UPGRADE_CHECK.md) lists the files and fields each analyzer reads.

### `badge`

```bash
evergreen badge [path] --snippet <markdown|html|rst> [--repo <owner/name>] [--branch <name>]
evergreen badge [path] --shields
```

Prints the README markup for the badge a repository publishes from its badge branch.

| Flag | What it does |
| --- | --- |
| `--snippet <markdown\|html\|rst>` | Markup flavor to print. Required unless `--shields` is given. |
| `--repo <owner/name>` | Repository to point the badge at. Defaults to the `origin` remote. |
| `--branch <name>` | Branch that publishes the badge. Default `evergreen-badge`. |
| `--shields` | Print shields.io endpoint JSON built from a scan of `[path]` instead of markup. |

### `diff`

```bash
evergreen diff <base>..<head> [path] [--json]
```

Scans both refs and reports the findings the change introduced and the ones it fixed. Exits `1` only when the change introduced findings.

| Flag | What it does |
| --- | --- |
| `[path]` | Repository path. Default `.`. |
| `--json` | Print the structured diff. |

### `drift`

```bash
evergreen drift [path] [--json] [--check] [--runtime <id>] [--align <release>]
```

Reports every runtime version a repository states and whether the values agree. It reads repository files and nothing else: no network, no commands, and no file is written. See [Runtime drift](DRIFT.md) for the sources each runtime reads and how it resolves them.
Reports every place a repository states a runtime version, with its exact file and line, the release it resolves to offline, and whether the versions agree. It reads files only: nothing is executed, no network is used, and no file is written. See [Runtime drift](DRIFT.md) for the sources each runtime reads.

| Flag | What it does |
| --- | --- |
| `[path]` | Repository path. Default `.`. |
| `--json` | Print the `evergreen.drift.v1` document, which conforms to [`schemas/drift.v1.schema.json`](../schemas/drift.v1.schema.json). |
| `--check` | Exit `1` when any runtime has more than one pinned release or a floor conflict. |
| `--runtime <id>` | Report only this runtime, such as `java`. |
| `--align <release>` | Print a unified diff for the pins of `--runtime` that can be rewritten to select `release`, and list the refused pins on stderr. Requires `--runtime`. |
| `--json` | Print the drift report, which conforms to [`schemas/drift.v1.schema.json`](../schemas/drift.v1.schema.json). |
| `--check` | Exit `1` when any runtime's pins disagree or a floor is above the lowest pinned release. |
| `--runtime <id>` | Limit the report to one runtime, such as `rust`. |
| `--runtime <id>` | Limit the report to one runtime, such as `go`. |
| `--align <release>` | Print a unified diff that makes every understood pin select `<release>`. Requires `--runtime`; values it will not rewrite are listed on stderr. |

### `rollup`

```bash
evergreen rollup <report.json>... [--owners <file>] [--json | --html]
```

Merges saved scan reports by product and owner. It reads files only and scans nothing.

| Flag | What it does |
| --- | --- |
| `--owners <file>` | Map paths to owners. |
| `--json` | Print the merged result as JSON. |
| `--html` | Print a self-contained HTML report. |

### `renovate-preset`

```bash
evergreen renovate-preset [path]
```

Prints Renovate `packageRules` for replacements and runtime pins as JSON. It does not edit a Renovate config or write any file.

### `dependabot-config`

```bash
evergreen dependabot-config [path]
```

Prints a `dependabot.yml` that groups updates for deprecated packages. It writes no file.

### `fix`

```bash
evergreen fix [path] [--dry-run | --branch] [--json]
```

Prints patches for deterministic fixes; nothing is written by default. Apply the printed patches with `evergreen fix | git apply`.

| Flag | What it does |
| --- | --- |
| `--dry-run` | Print the patches and write nothing. This is the default behaviour. |
| `--branch` | Apply the fixes on a local `evergreen/fix` branch and commit them. It never pushes. Cannot be combined with `--dry-run` or `--json`. |
| `--json` | Print the fix plan as JSON. |

### `baseline`

```bash
evergreen baseline [path] [--output <file>]
```

Writes the current findings as accepted findings, carrying the history forward from an existing baseline file.

| Flag | What it does |
| --- | --- |
| `--output <file>` | Destination file. Default `.evergreen-baseline.json`. |

## Supply-chain checks

### `check`

```bash
evergreen check <purl> [--fail-on <severity|none>] [--json]
```

Checks one Package URL against the bundled lifecycle rules and prints the status, replacement, and evidence.

| Flag | What it does |
| --- | --- |
| `--fail-on <severity\|none>` | Exit `1` when the package is affected at or above this severity. Default: the config's `failOn`, else `high`. |
| `--json` | Print the structured check result. |

An unused package is not reported as safe: `no-data` means Evergreen has no rule for it.

### `check-snippet`

```bash
evergreen check-snippet --path <path> [--json]   # content arrives on stdin
```

Answers "if I write this content to this path, what would Evergreen flag?" before the file exists. Pipe the snippet on stdin and pass the intended repository-relative path with `--path` — `Dockerfile`, `.github/workflows/ci.yml`, `package.json`. Evergreen writes only that one file into a temporary directory, runs every built-in detector against it, and prints the findings with paths and lines relative to the snippet. The temporary directory is always removed, and the real repository is never read or written.

| Flag | What it does |
| --- | --- |
| `--path <path>` | The repository-relative path the snippet is meant to be written to; it decides which detector reads it. Required. |
| `--json` | Print the structured check result (`evergreen.check-snippet.v1`). |

Paths that are absolute, contain `..`, or exceed 256 characters are rejected, as is content over 1 MB.

### `guard`

```bash
evergreen guard [--fail-on <severity|none>] [--force] npm install <package>...
```

Checks packages before the package manager runs, then installs only when allowed. Evergreen reads its own options only before the manager token; everything after `npm`, including `--force`, is passed to npm.

| Flag | What it does |
| --- | --- |
| `--fail-on <severity\|none>` | Refuse the install when a package is affected at or above this severity. Default `high`. |
| `--force` | Run the install anyway after printing a warning. |
| `--data-version <version>` | Pin the lifecycle data for the check, before the manager token. |

Only `npm install` is supported today. The command exits with npm's own code when it runs, and `1` when it refuses.

### `usage`

```bash
evergreen usage [--file <path>] [--json]
```

Summarizes the local log of dependency checks. Logging is off unless `EVERGREEN_USAGE_LOG` is set to `1` (the default file) or to a file path, and nothing leaves the machine.

| Flag | What it does |
| --- | --- |
| `--file <path>` | Read another log file. Defaults to the log named by `EVERGREEN_USAGE_LOG`. |
| `--json` | Print the summary as JSON. |

## Deployed resources

### `inventory`

```bash
evergreen inventory <file>... [--format auto|<importer-id>] [--json] [--fail-on <severity|none>] [--redact]
```

Reports end-of-life runtimes, images, engines, operating systems, and cluster objects from the export files that cloud and cluster tools already produce, such as `kubectl get -o json` or `terraform show -json`. Evergreen never calls a provider API: you run the export command, and Evergreen reads the file. Each result names the importer, the file, and the JSON Pointer to the exact version value the claim rests on.

A file no importer recognizes is listed, and the run exits `2`, after the recognized files are still reported.

| Flag | What it does |
| --- | --- |
| `--format auto\|<importer-id>` | Read the files with one importer instead of auto-detection. Default `auto`. |
| `--json` | Print the `evergreen.inventory.v1` report. |
| `--fail-on <severity\|none>` | Exit `1` when an affected result is at or above the severity. Default: the config's `failOn`, else `high`. |
| `--redact` | Replace every resource name with the first 12 hex characters of its SHA-256. |

## Integrations

### `mcp`

```bash
evergreen mcp
```

Starts the local MCP server on stdin and stdout. The server owns both streams until the host disconnects, so the command has no exit code. See [Local MCP server](MCP.md).

### `data`

```bash
evergreen data status [--json]
evergreen data update [--data-version <version>] [--json]
```

`status` shows the active lifecycle data version and its age. `update` downloads and verifies signed data; this is one of the few commands that uses the network. Downloaded data is not active until you pin it with `--data-version` (or the config or environment).

| Flag | What it does |
| --- | --- |
| `--data-version <version>` | Version to download, or `bundled`. |
| `--json` | Print the status or update result as JSON. |

### `export`

```bash
evergreen export --format cle [--data-version <version>]
evergreen export --format portal [path...] [--data-version <version>] [--report-base-url <url>]
```

| Flag | What it does |
| --- | --- |
| `--format cle` | Print CLE 1.0 snapshots, one JSON document per line and component. Rules that cannot be represented are skipped and counted on stderr. |
| `--format portal` | Print a developer-portal catalog with severity counts, the next end-of-life date, and a report link per scanned path. Paths default to `.`. Also accepts `--no-cache`. |
| `--report-base-url <url>` | Base URL for the report links in the portal catalog. |

### `sbom`

```bash
evergreen sbom enrich <bom.json> [--data-version <version>]
```

Prints an enriched CycloneDX or SPDX 2.3 document; the format is detected from the file. The input is left unchanged. An unreadable or invalid BOM exits `4`.

### `watch`

```bash
evergreen watch add|remove <path>
evergreen watch list [--json]
evergreen watch [run] [--weekly] [--json]
```

`add` and `remove` maintain the list of watched projects, `list` prints it, and `run` (the default subcommand) re-scans them and prints only what changed.

| Flag | What it does |
| --- | --- |
| `--weekly` | With `run`, build a weekly digest instead of the usual since-last-run changes. |
| `--json` | Print `list` or the digest as JSON. |

## Setup and authoring

### `init`

```bash
evergreen init [path] [--file AGENTS.md|CLAUDE.md] [--fail-on <severity>] [--yes] [--dry-run]
evergreen init agent [path] [--file AGENTS.md|CLAUDE.md] [--dry-run]
evergreen init --agents [path] [--file AGENTS.md|CLAUDE.md] [--dry-run]
evergreen init --hooks [path] [--fail-on <severity>] [--dry-run]
evergreen init --personal [--fail-on <severity>] [--yes] [--dry-run]
```

The guided form with no flags detects the CI provider and agent hosts, then applies the matching GitHub Actions workflow, pre-push hook, and agent section after one confirmation that defaults to yes.

| Flag | What it does |
| --- | --- |
| `agent` | Detect the agent host and write the matching instruction file, without asking. |
| `--agents` | Write only the Evergreen section in `AGENTS.md` or `CLAUDE.md`. |
| `--hooks` | Write only the Git pre-push hook that blocks a push at `--fail-on` or above. |
| `--personal` | Write a global config and pre-push hook for every repository. Takes no path and cannot be combined with `--agents` or `--hooks`. |
| `--file <AGENTS.md\|CLAUDE.md>` | Which instruction file to write, for the guided form, `init agent`, or `--agents`. |
| `--fail-on <severity>` | Severity that blocks a push. Default `high`. |
| `--yes`, `-y` | Confirm without a prompt for the guided form and `--personal`. Required when stdin is not a terminal, unless you pass `--dry-run`. |
| `--dry-run` | Print the planned changes and diffs; write nothing. |

### `setup`

```bash
evergreen setup [path] [--yes] [--dry-run]
```

Writes the Evergreen section to the instruction file of every detected agent host and offers the Skill for supported hosts.

| Flag | What it does |
| --- | --- |
| `--yes`, `-y` | Confirm the writes and install the Skill. The Skill install uses the network. |
| `--dry-run` | Print the plan and diffs; write and install nothing. |

### `new-detector`

```bash
evergreen new-detector <id> [--ecosystem <slug>]
```

Creates a detector skeleton. It is for contributors: run it from a checkout after `npm run build`, or it exits `2`.

### `new-rule`

```bash
evergreen new-rule <id> [--ecosystem <slug>]
```

Adds a rule and its match and clean fixtures to `registry/<ecosystem>.json`. It is for contributors and needs a checkout after `npm run build`.

### `rules`

```bash
evergreen rules lint [file...]
evergreen rules test <id>
```

`lint` checks lifecycle rules for problems before CI does; with no files it checks the whole registry. `test` runs one rule against `tests/fixtures/<id>/match` and `tests/fixtures/<id>/clean`. Both exit `1` when a rule has a problem or a fixture fails.

## Reading findings

### `explain`

```bash
evergreen explain <finding-id> [path] [--json]
```

Prints one finding with its severity, location, replacement, deadline, and evidence.

| Flag | What it does |
| --- | --- |
| `--json` | Print the finding document, which conforms to [`schemas/finding.v1.schema.json`](../schemas/finding.v1.schema.json). |

### `context`

```bash
evergreen context <finding-id> [path] [--json]
```

Builds the migration packet for one finding: affected files and usages, constraints, pinned runtime versions, and verification commands. Evergreen suggests the commands; it never runs them.

| Flag | What it does |
| --- | --- |
| `--json` | Print the migration packet, which conforms to [`schemas/context.v1.schema.json`](../schemas/context.v1.schema.json). |

### `report-issue`

```bash
evergreen report-issue <finding-id> [path] [--output <file>]
```

Prints a ready-to-review issue report for one finding. It never opens an issue.

| Flag | What it does |
| --- | --- |
| `--output <file>` | Write the report to this file instead of stdout. |

### `doctor`

```bash
evergreen doctor [path] [--system] [--json]
```

Checks the runtime, package, MCP, Skill, plugin, and CI setup around a repository.

| Flag | What it does |
| --- | --- |
| `--system` | Also check the runtimes and tools installed on this machine, such as Node.js, Python, Go, Java, .NET, and Terraform. |
| `--json` | Print the diagnosis document, which conforms to [`schemas/doctor.v1.schema.json`](../schemas/doctor.v1.schema.json). |

The command exits `1` when any check fails.

### `verify`

```bash
evergreen verify [path]
```

Checks the installed Evergreen release against the release manifest the package ships (`dist/src/release-manifest.json`), then says plainly what it could not check. `path` is a package root, for checking an unpacked copy; it defaults to the package that is running.

The manifest lists every shipped file with its SHA-256 and size, so the command exits `1` when a file was changed, shortened, or removed. When the package also carries `dist/src/release-manifest.json.sigstore.json`, its Sigstore signature is verified offline against the trusted root bundled with the package. A missing manifest or signature is reported as "not checked", not as a failure: versions released before manifests existed keep working. It also reports which lifecycle data is active and whether that data carries a signer.

The command never uses the network. It cannot prove that the published tarball came from this repository, because that evidence lives outside the installed tree. The report names the exact commands that do check it:

- `npm audit signatures` verifies the registry signature and the npm provenance attestation for a package in a project's `node_modules`.
- `npm audit signatures --json` prints the same verification for a script.
- `gh attestation verify <file> --repo arminazimi/evergreen` verifies a binary's GitHub build attestation.

Exit codes: `0` when every checked file matches (or when the installation carries nothing this version can check), `1` when a file, the manifest, or the signature does not verify, and `2` for bad input.

### `capabilities`

```bash
evergreen capabilities [--json]
```

Prints the capability manifest (`evergreen.capabilities.v1`) that describes the surfaces, ecosystems, and capabilities available in this version. Its schema is [`schemas/capabilities.v1.schema.json`](../schemas/capabilities.v1.schema.json); see [Capability manifest](CAPABILITIES.md).

| Flag | What it does |
| --- | --- |
| `--json` | Print the manifest as JSON. |

### `completions`

```bash
evergreen completions <bash|zsh|fish>
```

Prints a shell completion script to stdout. For example, `source <(evergreen completions bash)`.

## Exit codes

Every failure belongs to one class, and the class decides the exit code. With `--json`, the same class is written to stdout as an `evergreen.error.v1` document, so a caller can branch without parsing messages.

| Class (`error.code`) | Exit code | Meaning |
| --- | --- | --- |
| *(none)* | `0` | The command succeeded. |
| `policy` | `1` | A gate you configured failed: `scan` or `check` found an affected dependency at or above `--fail-on`, `diff` introduced findings, `doctor` reported a failed check, `rules` found a problem, or `--on-expired fail` met an expired suppression. |
| `usage` | `2` | The command line is wrong: unknown command, flag, or value, or a missing argument. |
| `data` | `3` | The input is well formed but the data is not there: an unknown finding ID, an unavailable data version, or a refused data update. |
| `parse` | `4` | An input could not be parsed: an invalid Package URL, an unreadable baseline, a damaged `AGENTS.md` section, or an invalid SBOM. |
| `internal` | `5` | Evergreen failed unexpectedly. This is a bug; please report it. |

A `policy` failure is a verdict on a result that was already printed, so stdout stays that single result document and no error document is added. The message also goes to stderr in every mode, and `--debug` adds the stack trace for `internal` failures.

The classes and their exit codes are stable; a new class would get a new number rather than renumber an existing one. The same table is published in [Capability manifest](CAPABILITIES.md#exit-codes-and-error-codes), and its source is the `EXIT_CODES` constant in `src/commands/types.ts`.
