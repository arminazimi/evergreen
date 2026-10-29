# Benchmarks

## Source usage analysis

Run `npm run benchmark:usage` to generate 200 TypeScript files in a temporary repository and scan them as one batch. Every file contains one aliased package import, one real method call, one comment lookalike, and one string lookalike.

The benchmark expects 400 true usages. It reports detected usages, precision, recall, and wall-clock scan time, and exits unsuccessfully unless precision and recall are both 1.0. The time is observational rather than a fixed CI gate because filesystem and runner performance vary.

On 2026-10-14, the benchmark detected all 400 usages with 1.0 precision and 1.0 recall in 29.64 ms on the development machine. Treat the duration as a reference point, not a cross-machine performance guarantee.

### Regex versus tree-sitter

The same command also compares the two usage engines on the repository's own `src/**/*.ts` (120 files, real code, no network). The regex scanner runs as one batch over the directory; the tree-sitter analyzer parses and queries each file. Each engine runs 15 times after a warm-up, with a contract of Node.js file-system and path imports and calls, and the report gives the median and 95th percentile of a whole-corpus run. The first tree-sitter run also loads the WebAssembly runtime and grammar, so it is reported separately as `coldFirstRunMs`.

On 2026-10-21 on the development machine:

| Engine | Median | p95 | Cold first run |
|---|---|---|---|
| Regex | 26.93 ms | 31.86 ms | n/a |
| Tree-sitter | 131.70 ms | 151.55 ms | 240.60 ms |

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

In CI, the release workflow (`.github/workflows/release.yml`) uses its own inline timing in the `quickstart` job across clean Linux, macOS, and Windows runners after npm publish. The runner executes the package smoke script first (which warms the npm package cache) and then times `scan . --json` on the smoke fixture, isolating execution from npm registry latency. The job asserts that the scan finishes within the two-minute budget (`durationMs <= 120000`) and writes the measured duration to `$GITHUB_STEP_SUMMARY`. Actual per-release runner measurements appear in each release run's summary.

## Scan performance budget

Unlike the reference points above, the performance budget is a hard gate: the CI workflow runs the `perf-budget` job on every pull request, and the job fails when a scan of the fixed smoke fixture (`tests/fixtures/smoke`) exceeds a documented time or memory budget.

Run `npm run benchmark:perf-budget` to reproduce it locally. The benchmark (`benchmarks/perf-budget.ts`) scans a clean temporary copy of the fixture in-process with the built-in detectors, scan caches disabled, and no network access. It runs one warm-up scan, then three measured runs, and reports the mean wall-clock time and the peak resident set size of the process. A scan that reports no findings also fails the gate, so a broken-but-fast scan cannot pass.

### Budgets

| Measurement | Budget | Reference (2026-10-28, macOS, Apple silicon, Node.js 22) |
|---|---|---|
| Mean wall time over the measured runs | 2,000 ms | 4–11 ms |
| Peak resident set size | 768 MB | 87 MB |

Both budgets carry roughly an order of magnitude of margin over the reference measurement so that runner noise never trips the gate — only a deliberate or catastrophic slowdown does. Raise a budget in the same commit that intentionally regresses scans, state the reason in that commit, and update this table; the ceilings live in `PERF_BUDGET` in `benchmarks/perf-budget.ts` and are enforced by `tests/perf-budget.test.ts`.

### Verifying the gate trips

A deliberate slowdown fails the check with exit code 1 and a `::error::` annotation:

```bash
node dist/benchmarks/perf-budget.js --simulate-slowdown-ms 3000 --check
# mean scan wall time 3012 ms exceeded the 2000 ms budget
```

The unit tests cover the same path with a smaller simulated slowdown, so a gate that stopped tripping would fail `npm run check`.

## Large-monorepo performance

Run `npm run benchmark:monorepo` to time an in-process scan of a synthetic ~100k-file npm workspaces monorepo. The adoption goal is that a repository of that size finishes under 5 seconds mean wall time with caches disabled.

### Methodology

The benchmark (`benchmarks/monorepo.ts`) builds a temporary monorepo offline: a root `package.json` with `workspaces: ["packages/*"]`, about 100 workspace packages (several declare the deprecated `request` dependency and a TypeScript import that exercises source-usage), and enough empty filler files to reach at least 100,000 regular files. It runs one warm-up scan, then three measured scans via `scanRepository` with the built-in detectors and `noCache: true`, and reports mean wall-clock time, peak resident set size, file count, and findings count. A scan that reports no findings fails the gate. Pass `--path <dir>` to measure an existing local monorepo instead (still offline — no network), or `--files N` / `--packages N` to shrink the synthetic fixture for local iteration.

### Budget and reference

| Measurement | Budget | Reference (2026-10-29, macOS, Apple silicon, Node.js 22.23) |
|---|---|---|
| Mean wall time over the measured runs (≥100,000 files, `noCache: true`) | 5,000 ms | 716 ms |
| Peak resident set size | observational | 132 MB |
| Findings (synthetic fixture) | > 0 | 9 |

The 5-second ceiling is the product goal from the roadmap; the reference run sits well under it on the development machine. Raise the ceiling in `MONOREPO_BUDGET` in `benchmarks/monorepo.ts` in the same commit that intentionally regresses large-repo scans, state the reason, and update this table. Unit tests cover the evaluator and a small synthetic fixture; they do not create 100k files.

```bash
npm run benchmark:monorepo -- --check
npm run benchmark:monorepo -- --files 5000 --runs 1 --warmup 0
npm run benchmark:monorepo -- --path /path/to/local/monorepo --json
```
