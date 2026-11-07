# Benchmarks

## Agent migration benchmark

The agent migration benchmark measures whether a coding agent resolves a real lifecycle finding, and whether the finding's [migration packet](MIGRATION_PACKETS.md) changes that outcome. It runs every task twice — once from a bare task prompt and once from the packet prompt — in separate worktrees at the task's pinned commit.

This page publishes the task set, the two arms, the scoring rules, and the reproduction commands. It deliberately contains no estimated numbers: the measured per-agent results are not recorded in this repository yet.

### Run metadata

| Field                              | Value             |
| ---------------------------------- | ----------------- |
| Page published                     | 2026-11-01        |
| Benchmark implementation at        | commit `1acd0968` |
| Measured run                       | none recorded     |
| Agents and model versions measured | none recorded     |

A measured run needs real agent hosts and local clones of the pinned repositories. It is tracked separately in [#1534](https://github.com/arminazimi/evergreen/issues/1534), which will publish the per-agent tables and link them here.

### Task set

The 20 tasks live in [`benchmarks/agent-migrations/tasks.json`](../benchmarks/agent-migrations/tasks.json). Each task pins a public repository and commit, one finding (`ruleId`, path, and line) that a scan of that commit reports, an expected end state, at least one verification command, and the real migration commit used as evidence.

| Group                             | Tasks                                                                               |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| Rust crates (`atty`, `ansi_term`) | `hyperfine-atty`, `just-ansi-term`, `dust-ansi-term`, `wasm-pack-atty`              |
| Go runtime and container image    | `bubbletea-go`, `caddy-go`, `lazygit-go`, `lazygit-go-image`, `node-exporter-go`    |
| .NET runtime                      | `sloth-dotnet`, `sourcelink-dotnet`                                                 |
| Node.js container image           | `homepage-node-image`                                                               |
| Node.js CI workflows              | `lighthouse-node`, `paperhanger-node`                                               |
| PHP and Ruby runtimes             | `behat-php`, `packwerk-ruby`                                                        |
| npm packages and Node.js          | `auth0-request`, `outline-koa-router`, `fork-corner-node-sass`, `outline-crypto-js` |

The expected end state is checked with regular expressions over the named files: each `mustNotMatch` must be absent and each `mustMatch` must be present. The verification commands are the project's own build or test commands, such as `cargo test --all --locked`, `go build ./...`, `dotnet build`, `docker build .`, or `yarn tsc`; they run in the migrated worktree.

### The two arms

| Arm        | Prompt                                                                                                                                                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `baseline` | The task title, rule id, and finding location, with an instruction to make the smallest change and run the verification commands. No packet.                                                                                                                              |
| `packet`   | A fresh offline scan of the worktree must report the same rule at the same path and line. The harness then builds the finding's migration packet (affected files and usages, constraints, pinned runtimes, and verification commands) and renders it as the agent prompt. |

Both prompts are written to a temporary file outside the worktree and its path is exported as `EVERGREEN_MIGRATION_PROMPT_FILE`, so the agent command does not need to embed a multi-line prompt in `argv`. The harness never fetches; the repository must already contain the pinned commit. Each arm gets its own detached `git worktree`, which is removed after the run unless `--keep-worktrees` is passed.

For each arm the harness records the agent exit code, wall-clock duration, diff and changed files, the expected-end-state checks, and every verification command's exit code and duration. A condition is unsuccessful when the agent exits non-zero, a check fails, verification fails, or the run errors (for example, when the fresh scan does not report the finding).

### How a migration is scored

[`benchmarks/agent-migrations/score.ts`](../benchmarks/agent-migrations/score.ts) applies three objective criteria. A migration succeeds only when all three hold:

1. **Finding resolved** — every expected-end-state check passed.
2. **Verification passed** — every task verification command exited 0.
3. **No unrelated changes** — every path in the captured diff is allowed.

The allowed set is the finding path, every expected-end-state check path, optional caller-supplied related paths (typically the packet's affected files), and companion lockfiles next to those paths (`Cargo.lock` next to `Cargo.toml`, `go.sum` next to `go.mod`, and the npm, Composer, Bundler, and other companion lockfiles listed in `score.ts`). Scoring is pure and offline: it does not invoke the agent, scan, or use the network.

Rates are fractions of attempts: success rate, finding-resolved rate, verification-passed rate, and no-unrelated-changes rate, rounded to four decimal places. `rateByCondition` groups the scored conditions into the `baseline` and `packet` arms; `summarizeScores` aggregates any list of scores. The scoring unit tests cover each criterion, companion lockfiles, related paths, and baseline-versus-packet rates.

When scoring a `packet` run, pass the packet's affected files as `relatedPaths` if the migration legitimately edits usage sites that the end-state checks do not name; otherwise those edits count as unrelated changes.

### Results per agent

There are no result rows to publish yet. As of 2026-11-01, `benchmarks/agent-migrations/` contains the task set, the harness, and the scorer, but no result file from a real agent. The repository's discovery metrics in `metrics/discovery/` measure whether agent hosts recommend Evergreen; they are not migration results.

When real runs exist, each row will record the agent and its version, the model and its version, the arm, attempts, successes, success rate, and the three criteria's counts and rates. Runs are not filtered: every failure and timeout is published with the row. The fake adapters used by the tests exercise the harness offline; they are not measurements, and CI never calls a model.

### Reproduction

Requires Node.js 22 or newer, network access to clone the pinned repositories, and the toolchains the tasks verify with (Rust, Go, Docker, .NET, PHP, Ruby, Node.js, Bun, and Yarn as applicable).

```bash
npm ci
npm run build --silent

# List the task ids.
node dist/benchmarks/agent-migrations/run.js --list

# Clone one pinned repository, then run both arms with a real agent.
git clone https://github.com/sharkdp/hyperfine ~/src/hyperfine
node dist/benchmarks/agent-migrations/run.js \
  --task hyperfine-atty \
  --repository ~/src/hyperfine \
  --agent-name claude-code \
  --agent-command 'my-agent "$EVERGREEN_MIGRATION_PROMPT_FILE"' \
  --output artifacts/agent-migrations/hyperfine-atty-claude-code.json

# One arm only, with explicit timeouts.
node dist/benchmarks/agent-migrations/run.js \
  --task hyperfine-atty \
  --repository ~/src/hyperfine \
  --condition packet \
  --agent-name claude-code \
  --agent-command 'my-agent "$EVERGREEN_MIGRATION_PROMPT_FILE"' \
  --timeout-ms 1800000 \
  --verification-timeout-ms 1800000
```

Replace `my-agent` with the host's non-interactive command; the prompt file path is in `EVERGREEN_MIGRATION_PROMPT_FILE`. Repeat per task, cloning the repository named in `tasks.json` so that its pinned commit is present. `--json` prints the full per-condition result instead of the summary. The command exits 0 when the run completes, even when the migration itself fails, so score the saved JSON rather than the exit code.

After saving a run, compute its rates with the scorer:

```bash
node --input-type=module -e '
import { readFileSync } from "node:fs";
import { loadMigrationTasks } from "./dist/benchmarks/agent-migrations/run.js";
import { scoreMigrationRun, rateByCondition } from "./dist/benchmarks/agent-migrations/score.js";
const [resultPath, taskId] = process.argv.slice(1);
const result = JSON.parse(readFileSync(resultPath, "utf8"));
const task = loadMigrationTasks().tasks.find((candidate) => candidate.id === taskId);
if (task === undefined) throw new Error(`unknown task: ${taskId}`);
console.log(JSON.stringify(rateByCondition(scoreMigrationRun(task, result).conditions), null, 2));
' artifacts/agent-migrations/hyperfine-atty-claude-code.json hyperfine-atty
```

### Artefacts

- Task definitions: [`benchmarks/agent-migrations/tasks.json`](../benchmarks/agent-migrations/tasks.json)
- Harness and agent adapters: [`benchmarks/agent-migrations/run.ts`](../benchmarks/agent-migrations/run.ts)
- Scoring rules and rates: [`benchmarks/agent-migrations/score.ts`](../benchmarks/agent-migrations/score.ts)
- Packet construction and prompt: [`src/migration-packet.ts`](../src/migration-packet.ts), [`src/migration-prompt.ts`](../src/migration-prompt.ts), [`src/runtime-pin.ts`](../src/runtime-pin.ts)
- Tests: [`tests/agent-migration-tasks.test.ts`](../tests/agent-migration-tasks.test.ts), [`tests/agent-migrations-run.test.ts`](../tests/agent-migrations-run.test.ts), [`tests/agent-migrations-score.test.ts`](../tests/agent-migrations-score.test.ts)
- Plan-arm timings and guardrail outcomes use a separate proof page; see [#1534](https://github.com/arminazimi/evergreen/issues/1534).

## Agent staleness benchmark

The agent staleness benchmark measures how often coding agents write end-of-life or deprecated choices when they produce common project files — Dockerfiles, GitHub Actions workflows, Kubernetes manifests, package manifests, Terraform modules, and small Python or Node helpers — and whether Evergreen's agent hook changes that rate.

Each task is a version-free prompt that names only the file to write. The harness runs every task twice in a fresh temporary directory: once with no Evergreen setup (`plain`), and once after `evergreen init --agents` plus `init --hooks-for <host>` when the host supports it (`hooks`). The produced file is saved under `outputs/<agent>/<arm>/<task>/` with a `meta.json` that records the agent version and date. Scoring is offline: `score.ts` scans each output directory with `scanRepository` and reports, per agent, arm, and category, the share of tasks with at least one finding, findings per task, and the rule ids seen.

### Run metadata

| Field                              | Value         |
| ---------------------------------- | ------------- |
| Page published                     | 2026-11-07    |
| Benchmark implementation           | this section  |
| Measured run                       | none recorded |
| Agents and model versions measured | none recorded |

A measured run needs installed agent CLIs (`claude -p`, `codex exec`, `gemini -p`, or equivalent) and network access. It is maintainer-only: after the first real run (at least three agents, both arms) the committed outputs and this table are updated. Until then the repository ships hand-written **seed** outputs under `outputs/seed/` so scoring stays tested in `npm run check`.

### Limits

- Prompt wording affects what agents write; the task set is fixed and version-free so runs stay comparable, but it is not a census of every prompt an engineer might type.
- Agent and model versions drift. Publish the version string from `meta.json` with every measured row; do not compare rows across unstated versions.
- The `hooks` arm only installs host configuration Evergreen knows how to write today (`claude-code`, `codex`, `cursor`, and `gemini` for `--hooks-for`). Hosts without a hook adapter still get `init --agents`.
- Scoring judges the files the agent left on disk. It never executes repository code, never calls an agent, and never uses the network.

### Reproduction

```bash
npm ci
npm run build --silent

# Offline score of committed outputs (also covered by unit tests):
npm run bench:staleness:score
npm run bench:staleness:score -- --write

# Maintainer agent run (network + agent CLIs; not part of npm run check):
npm run bench:staleness:run -- --list
npm run bench:staleness:run -- --agent claude-code
npm run bench:staleness:run -- --agent codex --task dockerfile-node-app --arm plain
```

### Results

There are no measured agent rows yet. The seed aggregate from `npm run bench:staleness:score` (hand-written outputs, not a model) is:

| Agent | Arm   | Tasks with finding / tasks | Share  |
| ----- | ----- | -------------------------: | -----: |
| seed  | plain |                        7 / 9 | 0.7778 |
| seed  | hooks |                        0 / 7 | 0.0000 |

Per-category seed rows and rule ids are in [`benchmarks/agent-staleness/results.json`](../benchmarks/agent-staleness/results.json). Replace this table when the maintainer commits the first three-agent run.

### Artefacts

- Task definitions: [`benchmarks/agent-staleness/tasks.json`](../benchmarks/agent-staleness/tasks.json)
- Harness (network): [`benchmarks/agent-staleness/run.ts`](../benchmarks/agent-staleness/run.ts)
- Offline scorer: [`benchmarks/agent-staleness/score.ts`](../benchmarks/agent-staleness/score.ts)
- Seed outputs: [`benchmarks/agent-staleness/outputs/seed/`](../benchmarks/agent-staleness/outputs/seed/)
- Tests: [`tests/agent-staleness-score.test.ts`](../tests/agent-staleness-score.test.ts)

## Source usage analysis

Run `npm run benchmark:usage` to generate 200 TypeScript files in a temporary repository and scan them as one batch. Every file contains one aliased package import, one real method call, one comment lookalike, and one string lookalike.

The benchmark expects 400 true usages. It reports detected usages, precision, recall, and wall-clock scan time, and exits unsuccessfully unless precision and recall are both 1.0. The time is observational rather than a fixed CI gate because filesystem and runner performance vary.

On 2026-10-14, the benchmark detected all 400 usages with 1.0 precision and 1.0 recall in 29.64 ms on the development machine. Treat the duration as a reference point, not a cross-machine performance guarantee.

### Regex versus tree-sitter

The same command also compares the two usage engines on the repository's own `src/**/*.ts` (120 files, real code, no network). The regex scanner runs as one batch over the directory; the tree-sitter analyzer parses and queries each file. Each engine runs 15 times after a warm-up, with a contract of Node.js file-system and path imports and calls, and the report gives the median and 95th percentile of a whole-corpus run. The first tree-sitter run also loads the WebAssembly runtime and grammar, so it is reported separately as `coldFirstRunMs`.

On 2026-10-21 on the development machine:

| Engine      | Median    | p95       | Cold first run |
| ----------- | --------- | --------- | -------------- |
| Regex       | 26.93 ms  | 31.86 ms  | n/a            |
| Tree-sitter | 131.70 ms | 151.55 ms | 240.60 ms      |

Tree-sitter took about 4.9 times as long at the median, roughly 1.1 ms per file, in exchange for finding multi-line calls, aliases and re-exports and rejecting method calls that only share a name with an import (see `tests/usage-parity.test.ts`). The figures are reference points, not a CI gate.

The benchmark corpus is intentionally controlled. The automated test suite separately covers JavaScript and TypeScript import forms, aliases, Python imports and calls, configuration keys, ignored dependency directories, and comment/string false positives.

## Time to first useful finding

Run `npm run benchmark:first-run` to time a clean run of the quickstart to its first useful finding.

The benchmark tracks Evergreen's adoption goal: a new user goes from `npx` to a useful, explained finding in under two minutes (120 s) on any supported OS without prior installation or configuration.

### Methodology

The local benchmark (`benchmarks/first-run.ts`) measures wall-clock time from invoking the scan in a clean temporary directory containing a minimal project with known lifecycle issues (`tests/fixtures/smoke/package.json`). It tests:

1. Project and manifest discovery.
2. Rule evaluation against bundled offline lifecycle data.
3. Emission of the first useful finding (`npm.package.request.deprecated` at `package.json:5` and the Node.js end-of-life runtime).

On 2026-10-28, running `npm run benchmark:first-run` against the local build on macOS (Apple silicon, Node.js 26) completed the clean scan in 0.28 s, reporting 4 findings. Treat this duration as an observational local reference point.

### Release workflow timing

In CI, the release smoke stage (`.github/workflows/release-smoke.yml`) times the quickstart on clean Linux, macOS, and Windows runners after npm publish via `.github/scripts/quickstart-smoke.mjs`. The runner executes the package smoke script first (which warms the npm package cache) and then times `scan . --json` on the smoke fixture, isolating execution from npm registry latency. The script asserts that the scan finishes within the two-minute budget (`durationMs <= 120000`) and writes the measured duration to `$GITHUB_STEP_SUMMARY`. Actual per-release runner measurements appear in each release run's summary.

## Scan performance budget

Unlike the reference points above, the performance budget is a hard gate: the CI workflow runs the `perf-budget` job on every pull request, and the job fails when a scan of the fixed smoke fixture (`tests/fixtures/smoke`) exceeds a documented time or memory budget.

Run `npm run benchmark:perf-budget` to reproduce it locally. The benchmark (`benchmarks/perf-budget.ts`) scans a clean temporary copy of the fixture in-process with the built-in detectors, scan caches disabled, and no network access. It runs one warm-up scan, then three measured runs, and reports the mean wall-clock time and the peak resident set size of the process. A scan that reports no findings also fails the gate, so a broken-but-fast scan cannot pass.

### Budgets

| Measurement                           | Budget   | Reference (2026-10-28, macOS, Apple silicon, Node.js 22) |
| ------------------------------------- | -------- | -------------------------------------------------------- |
| Mean wall time over the measured runs | 2,000 ms | 4–11 ms                                                  |
| Peak resident set size                | 768 MB   | 87 MB                                                    |

Both budgets carry roughly an order of magnitude of margin over the reference measurement so that runner noise never trips the gate — only a deliberate or catastrophic slowdown does. Raise a budget in the same commit that intentionally regresses scans, state the reason in that commit, and update this table; the ceilings live in `PERF_BUDGET` in `benchmarks/perf-budget.ts` and are enforced by `tests/perf-budget.test.ts`.

### Per-detector budgets

The same job also protects each detector's speed. `benchmarks/detector-budget.ts` scans a clean copy of the committed fixture corpus (`tests/fixtures`, every ecosystem side by side) with one detector at a time, caches off, and compares each detector's median wall time over five scans with its ceiling in `benchmarks/detector-budgets.json`. A slow change fails with the detector's name:

```text
::error::detector ruby: median scan time 1900 ms exceeded the 1250 ms budget
```

Ceilings are eight times the median measured over repeated local runs, with a 750 ms floor, so runner noise does not trip them. A detector over its ceiling is measured up to two more times and fails only when its best median is still over. Every built-in detector must have a ceiling and every ceiling must name a built-in detector, so a new detector cannot ship unbudgeted. Raise a ceiling in the commit that intentionally regresses that detector, with the reason. Run `npm run benchmark:detector-budget` locally; `--simulate-slowdown go:2000 --check` proves the gate trips.

### Verifying the gate trips

A deliberate slowdown fails the check with exit code 1 and a `::error::` annotation:

```bash
node dist/benchmarks/perf-budget.js --simulate-slowdown-ms 3000 --check
# mean scan wall time 3012 ms exceeded the 2000 ms budget
```

The unit tests cover the same path with a smaller simulated slowdown, so a gate that stopped tripping would fail `npm run check`.

## CLI start-up budget

`evergreen --version` must answer without loading the command table. `src/cli.ts` handles the bare version flag itself (help still wins, as in `cli-main`), because importing `cli-main` pulls in every detector. Before the fast path the call took about 940 ms on the development machine; it now takes about 22 ms. Run `npm run benchmark:startup` to reproduce it: `benchmarks/startup.ts` spawns the built CLI with `--version`, discards one warm-up run, and reports the median wall-clock time of seven runs.

The `perf-budget` CI job fails when the median exceeds 400 ms (`STARTUP_BUDGET` in `benchmarks/startup.ts`), roughly an order of magnitude above the reference so that runner noise never trips it. Raise it only in the commit that intentionally regresses start-up, with the reason, and update this paragraph.

## Large-monorepo performance

Run `npm run benchmark:monorepo` to time an in-process scan of a synthetic ~100k-file npm workspaces monorepo. The adoption goal is that a repository of that size finishes under 5 seconds mean wall time with caches disabled.

### Methodology

The benchmark (`benchmarks/monorepo.ts`) builds a temporary monorepo offline: a root `package.json` with `workspaces: ["packages/*"]`, about 100 workspace packages (several declare the deprecated `request` dependency and a TypeScript import that exercises source-usage), and enough empty filler files to reach at least 100,000 regular files. It runs one warm-up scan, then three measured scans via `scanRepository` with the built-in detectors and `noCache: true`, and reports mean wall-clock time, peak resident set size, file count, and findings count. A scan that reports no findings fails the gate. Pass `--path <dir>` to measure an existing local monorepo instead (still offline — no network), or `--files N` / `--packages N` to shrink the synthetic fixture for local iteration.

### Budget and reference

| Measurement                                                             | Budget        | Reference (2026-10-29, macOS, Apple silicon, Node.js 22.23) |
| ----------------------------------------------------------------------- | ------------- | ----------------------------------------------------------- |
| Mean wall time over the measured runs (≥100,000 files, `noCache: true`) | 5,000 ms      | 716 ms                                                      |
| Peak resident set size                                                  | observational | 132 MB                                                      |
| Findings (synthetic fixture)                                            | > 0           | 9                                                           |

The 5-second ceiling is the product goal from the roadmap; the reference run sits well under it on the development machine. Raise the ceiling in `MONOREPO_BUDGET` in `benchmarks/monorepo.ts` in the same commit that intentionally regresses large-repo scans, state the reason, and update this table. The benchmark also enforces a peak-memory ceiling (`maxPeakRssBytes`, 1536 MB; `--max-rss-mb` overrides it), and `--simulate-leak-mb N` retains N MB per measured run to prove the gate trips. The `perf-budget` CI job runs the synthetic fixture and a real monorepo (`babel/babel`, pinned by commit in `.github/workflows/ci.yml`, 768 MB ceiling); bump the pin deliberately. Unit tests cover the evaluator and a small synthetic fixture; they do not create 100k files.

```bash
npm run benchmark:monorepo -- --check
npm run benchmark:monorepo -- --files 5000 --runs 1 --warmup 0
npm run benchmark:monorepo -- --check --simulate-leak-mb 1500   # a deliberate leak must fail the gate
npm run benchmark:monorepo -- --path /path/to/local/monorepo --json
```
