# Testing

A good test here fails when the behavior it names breaks, passes for the reason it claims, and runs the same way on every platform and every machine. This guide names each kind of test in the repository, when to use it, and a real example to copy. The rules that apply to every change are in [AGENTS.md](../AGENTS.md) and [CONTRIBUTING.md](../CONTRIBUTING.md#quality-standards).

## The gate

Tests use Node's built-in runner (`node:test`) and `node:assert/strict`; there is no test framework dependency. Test sources live under `tests/**/*.test.ts`, compile to `dist/tests/**/*.test.js`, and run from the compiled output. Always build first; `npm test` and `npm run check` do it for you.

```bash
npm ci
npm test                                  # build, then every test file
npm test -- dist/tests/cli.test.js        # one file; the argument goes to tools/run-tests.mjs
npm run test:coverage                     # coverage floors: 93% lines, 87% branches, 93% functions
npm run test:fuzz                         # the parser fuzz suite
npm run test:mutation                     # Stryker on the core engine, version ranges, and reporters
npm run check                             # build, Action bundle, tests, plugin checks, evals
```

`npm run check` is the gate. It runs the tests in `tools/check-pipeline.ts` (`testProcessArgs` at `tools/check-pipeline.ts:59`) alongside the Action bundle, plugin drift, and plugin evals. A new `tests/*.test.ts` file needs no registration: the runner globs `dist/tests/**/*.test.js` (`tools/run-tests.mjs:241`). Helper modules such as `tests/fuzz/parsers.ts` are compiled but not run as tests.

## Affected tests on pull requests

`ci.yml` writes the files a pull request changes to a list and points `EVERGREEN_AFFECTED_FILES` at it. On that lane, `tools/run-tests.mjs` runs only the test files that reach a changed module through imports (`tools/run-tests-selection.ts`). Every other lane — the merge queue, `main`, a schedule, and a local `npm test` — has no list and runs the whole suite.

- A changed test file runs itself.
- A changed module under `src/` or `tests/` runs every test that imports it, directly or through a test helper.
- A change the map cannot place runs everything: configuration (`package.json`, `tsconfig.json`, workflows), shared data (`registry/`, `schemas/`, `data/`), fixtures, `tools/` and `benchmarks/` sources, and a module no test imports.
- The `coverage` job always measures the whole suite, so the narrowing never moves a coverage floor.
- The map is built from the checkout at run time; it is not a committed file that can go stale.

Reproduce a narrowed run locally:

```bash
npm run build --silent
printf '%s\n' src/detectors/npm/index.ts > /tmp/changed.txt
EVERGREEN_AFFECTED_FILES=/tmp/changed.txt node tools/run-tests.mjs
```

The run prints `Affected tests: ...` and writes the same line to the job summary. When a shard is set, the summary notes that the subset is not balanced against the committed timings.

## Pick a kind

| Kind | Lives in | Use it when |
| --- | --- | --- |
| Unit | `tests/*.test.ts` | A pure function, formatter, parser, or one module's contract. |
| Detector and registry | `tests/<ecosystem>.test.ts`, `tests/registry-*.test.ts` | An ecosystem detector reads a manifest, or a registry rule/schema changes. |
| Conformance | `src/conformance/`, `tests/conformance.test.ts`, `tests/conformance-builtins.test.ts` | A detector's shared guarantees: determinism, locations, evidence, valid fields, bounded inputs, zero findings, malformed input. |
| Fixture-based | `tests/fixtures/`, `tests/*.test.ts` | A rule or detector has positive/negative boundaries that belong in a reviewable repository on disk. |
| CLI end-to-end | `tests/cli*.test.ts`, `tests/*-e2e.test.ts` | The behavior crosses the process boundary: arguments, exit codes, stdout, JSON contracts. |
| MCP | `tests/mcp*.test.ts` | A tool, resource, prompt, or annotation changes; use the in-memory transport. |
| GitHub Action | `tests/action-*.test.ts`, `tests/github-action*.test.ts` | Action inputs, env handling, or pull-request behavior; inject the API instead of calling it. |
| Fuzz and property | `tests/fuzz/` | Any parser that reads untrusted repository content. |
| Performance and benchmark | `tests/perf-budget.test.ts`, `tests/*-benchmark.test.ts` | A budget or evaluator changes, or a measured fixture needs a smoke run. |
| Cross-platform | `tests/paths.test.ts`, `tests/detector-inputs.test.ts` | Paths, separators, line endings, or `path.win32` behavior. |
| Self-scan and corpus | `tests/self-scan*.test.ts`, `tests/corpus-*.test.ts` | Repository guardrails, corpus thresholds, or the harness that compares findings with ground truth. |

## Unit tests

Use a unit test for a pure function or one module's contract. It is the cheapest kind and should carry most of the logic coverage. Assert the public result, not internal calls.

```ts
// tests/paths.test.ts:7
test("rewrites Windows separators and leaves POSIX paths alone", () => {
  assert.equal(toPosixPath(".github\\workflows\\ci.yml", "\\"), ".github/workflows/ci.yml");
  assert.equal(toPosixPath(".github/workflows/ci.yml", "/"), ".github/workflows/ci.yml");
  assert.equal(toPosixPath("package.json", "\\"), "package.json");
});
```

The scan engine's ordering rule is a unit test too: `tests/engine.test.ts:12` builds two findings out of order, runs `scanRepository`, and asserts the IDs come back sorted. That is the observable contract; do not assert on how the sort is implemented.

## Detector and registry tests

Detector tests read a small repository and assert findings: rule ID, severity, location, and evidence. Use the fixture directories for stable boundary cases, and a `mkdtemp` repository when the input is specific to the test.

```ts
// tests/npm.test.ts:34
const root = await repository({
  "package.json": JSON.stringify({
    engines: { node: "^20.0.0" },
    dependencies: { request: "^2.88.0" },
    devDependencies: { "node-sass": "^9.0.0" },
  }),
  "package-lock.json": JSON.stringify({
    lockfileVersion: 3,
    packages: {
      "node_modules/request": { version: "2.88.2" },
      "node_modules/node-sass": { version: "9.0.0" },
    },
  }),
});

const findings = await new NpmDetector().scan({ root });
assert.equal(findings.length, 4);
```

Registry tests are data tests. `tests/registry-v2.test.ts:27` loads every bundled v2 registry and asserts `registryV2Issues` is empty, so a malformed rule cannot ship. `tests/registry-v2.test.ts:73` is a table of invalid mutations (missing `reviewedAt`, an HTTP source, a versioned PURL, a duplicate ID) and asserts both the validator and the error message that names the rule and field. When you add a validation rule, add a row to that table instead of a new test function.

Use detector tests when the question is "does this ecosystem produce the right finding at the right line"; use registry tests when the question is "can this rule shape exist at all".

## Conformance tests

Conformance is the shared harness every detector must pass: deterministic ordered output, locations that exist, authoritative evidence, findings with valid fields, bounded inputs, no findings on a zero-finding fixture, and no throw on malformed input. It lives in `src/conformance/` and is exercised in `tests/conformance.test.ts`.

`tests/conformance-builtins.test.ts` is the one suite every registered detector runs. It reads `builtInDetectors`, so registering a detector adds it automatically, and it generates an empty repository, a repository whose every declared input is malformed, and one at the limits of the input, depth, and size checks. When the detector has `tests/fixtures/<id>`, a copy of those fixtures is also scanned and its findings checked for valid fields, evidence, existing locations, and stable order. Write an explicit expected-findings test in the detector's own file for what it reports; the shared suite checks how every detector reports.

```ts
// tests/conformance.test.ts:37
const root = await fixtureDirectory({
  ".github/workflows/ci.yml": "steps:\n  - uses: actions/checkout@v5\n",
});

await runDetectorConformance({
  detector: githubActionsDetector,
  fixtures: [{ name: "supported checkout", root, expectedFindings: [] }],
});
```

Use conformance when you add a detector, change the SDK seam, or change a guarantee that applies to all detectors. The negative tests in the same file show the failure you are buying protection from: a detector whose ordered output changes between scans (`tests/conformance.test.ts:83`), reports a location that does not exist, or omits a source. Do not duplicate these checks in an individual detector test.

## Fixture-based tests

A fixture is a tiny untrusted repository committed under `tests/fixtures/`. It is reviewable evidence and it is scanned, never executed. The layout for rules is `tests/fixtures/<rule-id>/match/` (must report the rule) and `clean/` (a lookalike that must not). Detector fixtures use `positive/`, `negative/`, `zero/`, and `malformed/`, each described by a README table.

```ts
// tests/npm.test.ts:149
test("node-sass-deprecated positive fixture reports the deprecated node-sass package", async () => {
  const findings = await new NpmDetector().scan({
    root: resolve(nodeSassDeprecatedFixtures, "positive"),
  });
  const deprecated = findings.filter((finding) => finding.ruleId === nodeSassDeprecatedRule);

  assert.equal(deprecated.length, 1);
  assert.equal(deprecated[0]?.location.path, "package.json");
});
```

The matching negative case is the next test, at `tests/npm.test.ts:157`. The fixture itself is `tests/fixtures/npm/node-sass-deprecated/`, and its README is the table a reviewer reads first. `tests/fixtures/README.md` describes the layout and the open edge-case fixture tasks.

Use a fixture when the boundary should stay visible in review, when the same input is scanned more than once, or when a maintainer triage decision needs to be locked in. Use an inline `mkdtemp` repository when the input exists only for one assertion and would add noise under `tests/fixtures/`. The rule scaffold and `evergreen rules test <rule-id>` expect the `match`/`clean` pair; see [Lifecycle rules](RULES.md).

## CLI end-to-end tests

Use an end-to-end test when the behavior only exists across the process boundary: parsing arguments, exit codes, stdout/stderr, and the JSON document a user or script consumes.

```ts
// tests/cli.test.ts:29
const root = await fixtureRepository();
const firstScan = await execute(process.execPath, [cli, "scan", root, "--json"]);
const result = JSON.parse(firstScan.stdout) as { findings: Array<{ id: string }> };
assert.equal(result.findings.length, 2);

const baselinePath = join(root, "baseline.json");
await execute(process.execPath, [cli, "baseline", root, "--output", baselinePath]);

const filteredScan = await execute(process.execPath, [
  cli, "scan", root, "--baseline", baselinePath, "--json",
]);
const filtered = JSON.parse(filteredScan.stdout) as { findings: unknown[] };
assert.deepEqual(filtered.findings, []);
```

The file resolves the built CLI once (`tests/cli.test.ts:11`), builds its repository in `mkdtemp` (`tests/cli.test.ts:17`), and cleans up in `after`. One test drives a whole user journey instead of one command per test; that keeps the process spawns, and the suite, cheap. `tests/cli-errors.test.ts` is the model for exit-code and error-document contracts.

Do not use an end-to-end test to check logic that a unit test can reach. Spawning the CLI is justified when the wiring itself is the thing that can break.

## MCP tests

MCP tests use the SDK's in-memory transport, so no port, subprocess, or network is involved. `tests/mcp.test.ts:89` initializes a real client and server over a linked pair, lists tools, calls `scan_repository`, and follows the finding through the scan-to-verification workflow. `tests/mcp.test.ts:426` checks that every tool advertises an `outputSchema` and that its structured content validates against it. One stdio test (`tests/mcp.test.ts:227`) covers the real transport; everything else stays in memory.

Use an in-memory MCP test for any tool shape, resource, prompt, or annotation change. Use the stdio test only when the transport or entry point changes.

## GitHub Action tests

Action tests keep two boundaries apart. Pure renderers and evaluators get unit tests; the pull-request behavior gets a stubbed GitHub API and a local bare `git` remote, so the test proves the branch and request without touching github.com.

```ts
// tests/action-fix-pr.test.ts:125
const { root, remote } = await repositoryWithFinding();
const before = await scanRepository(root, builtInDetectors);
const github = stubGitHub();
try {
  const first = await publishFixPullRequest(before, target(root));
  assert.equal(first.status, "opened");
  assert.equal(github.calls.filter((call) => call.method === "POST").length, 1);

  const again: ScanResult = await scanRepository(root, builtInDetectors);
  const second: FixPullRequestOutcome = await publishFixPullRequest(again, target(root));
  assert.equal(second.status, "updated");
  assert.equal(second.number, first.number);
} finally {
  github.restore();
}
```

`tests/action-fix-pr.test.ts:35` builds the local remote, and `tests/action-cold-start.test.ts:19` shows the evaluator unit style: fixed measurements, exact boundary, and one millisecond past it. Use the stub when the behavior is "what request does the Action make"; use the evaluator test when the behavior is "what counts as a violation".

## Fuzz and property tests

Every parser that reads repository content belongs in the fuzz suite. `tests/fuzz/parsers.ts` registers each parser with its deliberate error types, and `tests/fuzz/parsers.test.ts:48` runs a property over arbitrary strings and a grammar-flavored hostile input set. The property is stronger than "does not crash": the same input must produce the same result twice, and no single input may exceed the time budget.

```ts
// tests/fuzz/parsers.test.ts:48
for (const parser of parsers) {
  test(`${parser.name} tolerates hostile input`, { timeout: TEST_TIMEOUT_MS }, () => {
    fc.assert(
      fc.property(input, (contents) => {
        const first = run(parser, contents);
        const second = run(parser, contents);
        assert.deepEqual(second, first);
      }),
      { numRuns: RUNS, interruptAfterTimeLimit: TIME_LIMIT_MS, markInterruptAsFailure: false },
    );
  });
}
```

`npm run check` runs a small budget (100 runs and 5 seconds per parser by default). The nightly `.github/workflows/fuzz.yml` raises `EVERGREEN_FUZZ_RUNS` and `EVERGREEN_FUZZ_MS` for a deeper run. When a seed finds a real failure, pin the input as a deterministic regression test like `tests/fuzz/parsers.test.ts:63`, then fix the parser. Use the fuzz suite for parsers and untrusted-input handling, not for ordinary business logic.

## Performance and benchmark tests

Keep the evaluator and the measurement apart. The evaluator is deterministic and gets boundary tests; the measured run gets a generous budget so it catches a catastrophe without failing on runner noise.

```ts
// tests/perf-budget.test.ts:23
assert.deepEqual(evaluatePerfBudget(FITTING_MEASUREMENTS, PERF_BUDGET), []);

// tests/perf-budget.test.ts:36
const violations = evaluatePerfBudget(
  { ...FITTING_MEASUREMENTS, meanWallMs: PERF_BUDGET.maxMeanWallMs + 1 },
  PERF_BUDGET,
);
assert.match(violations[0]!, /wall time .* exceeded the 2000 ms budget/);
```

`tests/perf-budget.test.ts:56` proves the evaluator trips on a deliberate slowdown, and `tests/perf-budget.test.ts:68` runs the real fixed fixture and asserts it is inside the budget while still finding the deprecated package. The committed ceilings (`2,000 ms` mean wall time and `768 MB` peak RSS in `benchmarks/perf-budget.ts:19`) carry about an order of magnitude of margin; the dedicated `perf-budget` job in `.github/workflows/ci.yml` enforces them. `tests/action-cold-start.test.ts` follows the same pattern for Action startup.

Use this kind when a budget, a report, or a benchmark evaluator changes. Never assert a tight millisecond value that depends on the machine.

## Cross-platform tests

The tests run on Windows for every code pull request and on Windows and macOS on `main` and in the merge queue (`check-cross-os` in `.github/workflows/ci.yml:234`). That job also sets `core.autocrlf false` so patches in temporary repositories keep their line endings.

Write path tests against the path module, not the host. `tests/detector-inputs.test.ts:61` passes `path.win32` explicitly so the cross-drive case runs on Linux and macOS too:

```ts
// tests/detector-inputs.test.ts:61
const acrossDrive = win32.relative("C:\\repo", "D:\\a\\evergreen\\registry\\php.json");
assert.ok(win32.isAbsolute(acrossDrive), acrossDrive);
assert.equal(relativeInsideRoot("C:\\repo", "D:\\a\\evergreen\\registry\\php.json", win32), undefined);
```

Use this kind for separators, drive letters, case sensitivity, and line endings. Never hard-code `/tmp` or a POSIX separator in an assertion; build paths with `join` and compare with `toPosixPath` or `relativePosix` from `src/paths.ts`.

## Self-scan and corpus checks

These tests check Evergreen's own guardrails and its accuracy evidence, not a user-facing command.

- `tests/self-scan.test.ts:31` reads every workflow and `action.yml` and fails on a third-party `uses:` that is not a full SHA with a version comment. `tests/self-scan.test.ts:40` scans this repository with the GitHub Actions detector and requires zero unclassified references. The `self-scan` CI job runs the CLI with `.evergreen-baseline.json` and fails on a finding the baseline does not cover.
- `tests/corpus-thresholds.test.ts:14` asserts that `benchmarks/thresholds.json` names every shipped detector, sets at least 0.95 precision for each, and marks which detectors are enforced. `tests/corpus-harness.test.ts:29` tests the concurrency bound and ordering of the harness without fetching anything.
- The public corpus itself needs the network. It is not part of `npm run check`; run `npm run validate:public-repos` when detector behavior changes, following [AGENTS.md](../AGENTS.md#running-the-corpus-locally) and [Validation](validation/corpus.md).

Use these when you change detector accuracy, a threshold, the corpus harness, or the repository's own workflow pins. Keep the harness tests offline by injecting `checkout` and `scan`, as `tests/corpus-harness.test.ts:43` does.

## Conventions

### Deterministic output

Same input, same bytes. Fix the clock, sort unordered collections, and use forward slashes. `tests/reporters.test.ts:10` pins `scannedAt` to a constant before rendering golden text, `tests/engine.test.ts:12` asserts finding order, and `tests/receipts-golden.test.ts:14` rebuilds a receipt byte for byte from fixed before/after scans. JSON contracts have a `schemaVersion`; assert it (`tests/cli.test.ts:29`) so a shape change is visible.

### No network and no executing repository content

Scans and their tests use no network. `tests/offline.test.ts:42` scans `src/` for network imports, and `tests/offline.test.ts:129` installs a trap that fails any socket, DNS lookup, or `fetch` during a scan, a dependency check, an MCP-style tool call, status, and signature verification. The one network command, `evergreen data update`, is asserted separately at `tests/offline.test.ts:200`.

Fixtures are untrusted input: parse them, never evaluate or run them. `tests/detector-inputs.test.ts:47` traces which files a detector opens, and `tests/scaffold-templates.test.ts:51` rejects `child_process`, `fetch`, `eval`, and `new Function` in generated detectors and parsers. A test that shells out to a fixture's build tool, evaluates a `conanfile.py`, or calls a package registry is out of bounds.

### Fixtures and temporary directories

Committed fixtures go under `tests/fixtures/`. Dynamic fixtures use `mkdtemp(join(tmpdir(), "evergreen-<area>-"))` and are removed in `after`, as in `tests/npm.test.ts:17` and `tests/cli.test.ts:13`. The suite runs at twice the CPU count (`tools/check-pipeline.ts:59`), so a fixed shared path such as `/tmp/evergreen-test` races between files. Give every test its own directory.

### Quarantine and flaky tests

CI retries a failed test file once. A file that passes on retry is reported as flaky and the run still passes; the flaky marker is summarized in the job output (`tools/run-tests.mjs:288`). A genuinely flaky file goes in `tests/quarantine.json`:

```json
{
  "quarantined": [
    {
      "file": "tests/example.test.ts",
      "issue": "https://github.com/arminazimi/evergreen/issues/1234"
    }
  ]
}
```

`tests/quarantine.json:1` is currently empty. Quarantined files are skipped on `pull_request` and `merge_group` and run nightly by `ci-health` with `--quarantine-only` (`.github/workflows/ci-health.yml:91`). Every entry needs an open issue URL; the parser rejects anything else (`tools/run-tests.mjs:56`). Quarantine is for a real flake with an owner and a plan, never for a test that is red because the change is unfinished.

### Coverage

`npm run test:coverage` enforces 93% lines, 87% branches, and 93% functions (`package.json`). `main` enforces the floors; pull requests diff per-file line coverage against `main` for changed `src/` files. New code comes with tests. Raise a floor when coverage rises; never lower one to make a change pass.

### Mutation testing

`npm run test:mutation` runs Stryker over `src/engine/`, `src/baseline.ts`, `src/diff.ts`, and `src/vers/**` (`stryker.config.json:11`). The nightly `mutation` workflow publishes the score and survivors and fails a complete run below the overall 60% break (`stryker.config.json`). Because the workflow shards the scope, a shard runs with `stryker.shard.config.mjs` (no break) and the merged report in the `report` job applies the break and the per-file ratchet. Use it when you touch ordering, baseline matching, diffs, or version ranges, and when a unit test feels like it asserts too little. A surviving mutant usually means a missing assertion, not a missing test file.

## Anti-patterns

- **Snapshotting nondeterministic output.** A test that asserts on `scannedAt`, an absolute temporary path, elapsed milliseconds, or the order a map happened to return will fail on another machine. Fix the input (`tests/reporters.test.ts:10`), sort it (`tests/engine.test.ts:12`), or assert the fields that carry meaning.
- **Real sleeps.** A fixed `setTimeout` that waits for the system under test is either flaky or slow, usually both. Wait for the condition with a bounded deadline, as `MessageCollector.waitFor` does at `tests/lsp.test.ts:53`. The short timers in `tests/corpus-harness.test.ts:29` are not waits for the harness; they make injected work finish out of order so the ordering assertion means something.
- **Shared temp paths.** `/tmp/evergreen` in two test files is a race, not a shortcut. Use `mkdtemp` per test and clean up in `after`. The runner deliberately raises concurrency; do not lower it to hide a collision.
- **Weakening a check to land a change.** Do not lower a coverage floor, delete a conformance check, narrow the test glob, add a permanent skip, or loosen a threshold. If a test is genuinely flaky, quarantine it with an issue (`tests/quarantine.json`) and fix it. If a budget is genuinely wrong, raise it in the same commit with the measurement and the reason, and update [Benchmarks](BENCHMARKS.md).
- **Testing internals instead of the contract.** Assert the finding, exit code, JSON document, or rendered output that a caller sees. A test that reaches into a private helper keeps passing while the product breaks.
- **Network or execution in the test path.** Do not fetch a registry, call GitHub, or run a fixture's code to make an assertion. Stub the API (`stubGitHub` in `tests/action-fix-pr.test.ts`), use `InMemoryTransport` (`tests/mcp.test.ts:89`), and trap the network (`tests/offline.test.ts:129`).
- **End-to-end tests for logic.** A CLI spawn per assertion is slow and reports the failure far from its cause. Cover the logic with a unit or detector test and keep one end-to-end journey for the wiring.

## Checklist for a new test

1. Name the behavior, not the function: "reports the line of the declaration that was matched", not "tests parse".
2. Pick the smallest kind from the table that can observe it.
3. Give it its own input: a committed fixture or a `mkdtemp` directory.
4. Assert the observable result: finding, exit code, JSON field, or rendered text.
5. Run it without the change and confirm it fails for the expected reason.
6. Run `npm test -- dist/tests/<file>.test.js`, then `npm run check`.
7. If the change is user-visible, add a changelog fragment under `changes/`; a new dependency needs a reason in the pull request.
