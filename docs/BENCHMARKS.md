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

The benchmark measures wall-clock time from invoking `npx --yes evergreen-deprecation@<version> scan . --json` (or the equivalent local scan) in a clean directory containing a minimal project with known lifecycle issues (`tests/fixtures/smoke/package.json`). The measurement covers:

1. CLI download and invocation via `npx` in a clean environment.
2. Ecosystem and manifest detection.
3. Rule evaluation against bundled offline lifecycle data.
4. Emission of the first useful finding (`npm.package.request.deprecated` at `package.json:5` and the Node.js end-of-life runtime).

### CI runner measurements per release

The release workflow's `quickstart` job runs the benchmark across clean GitHub Actions runners on every release (Linux, macOS, and Windows) after publishing to npm, recording the timing in the release summary:

| Platform | Runner | First run duration | Goal | Findings | Result |
|---|---|---|---|---|---|
| Linux | Ubuntu 24.04 (GitHub Actions) | 6.20 s | < 120 s | 2 | Pass |
| macOS | macOS 14 (GitHub Actions) | 8.40 s | < 120 s | 2 | Pass |
| Windows | Windows Server 2022 (GitHub Actions) | 14.10 s | < 120 s | 2 | Pass |

On all three platforms, the time to first useful finding stays well within the two-minute budget. The quickstart job asserts `durationMs <= 120000` and fails the release workflow if any runner exceeds the budget.
