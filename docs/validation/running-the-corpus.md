---
title: Running the corpus
---

# Running the corpus

How to fetch, cache, narrow, record, and read a corpus run. The summary and the accuracy table are on [Validation](../VALIDATION.md).

## Fetching and the checkout cache

The harness fetches up to sixteen repositories at once; change that with `--concurrency <n>` or `EVERGREEN_CORPUS_CONCURRENCY`. Scans and the report stay in corpus order.

By default it fetches each repository as a blobless shallow fetch plus a sparse checkout of only the files the detectors declare they read ([decision 0015](../decisions/0015-corpus-fetch-strategy.md)): a cold full run takes about a minute and fetches about 190 MB, and the results are identical to a full checkout. `EVERGREEN_CORPUS_FETCH=shallow` fetches complete checkouts instead. `node dist/benchmarks/fetch-strategies.js --strategy <shallow|sparse|tarball>` re-measures the options.

Every corpus commit is pinned, so a checkout never changes. Set `EVERGREEN_CORPUS_CACHE=<dir>` (for example `~/.cache/evergreen-corpus`) to keep each one on disk as `<owner>__<repo>@<commit>` and skip the network when it is already there. Entries are written to a temporary directory and renamed into place, and `.git` is removed because scans read files only, so an interrupted run never leaves a half-filled entry. A sparse entry carries an `.evergreen-fetch` marker naming the declarations it was built from; if a detector later declares more files, that entry is refetched rather than reused. Unset, there is no cache and a run behaves as before. A warm run reports the same true positives, false positives, false negatives, and findings as a cold one.

## Running a subset

```bash
npm run validate:public-repos -- --ecosystem php
npm run validate:public-repos -- --ecosystem php --ecosystem ruby
npm run validate:public-repos -- --repo laravel/framework
```

`--ecosystem <name>` and `--repo <owner/name>` are repeatable; naming both selects the union, reported in corpus order. An unknown name is an error that lists the valid ones. A filtered run still fails on any false positive or false negative among the entries it covers, but it is not a full run: it does not enforce the per-detector precision floors, it writes no `lastFullRun`, the JSON report says `"fullRun": false` with a `filter` line, and the run prints `FILTERED RUN` on stderr. Only an unfiltered run can be recorded or compared with the full-corpus claims in this document.

### Re-running only what failed

After fixing a detector, re-check just the repositories that had a mismatch:

```bash
npm run validate:public-repos -- --output corpus-result.json     # a run with UNEXPECTED or MISSING lines
npm run validate:public-repos -- --failed-from corpus-result.json
```

`--failed-from <report.json>` runs the repositories whose entry in that report has an `unexpected` or `missing` finding; any that have left the corpus are skipped. It is a filtered run like the others (`FILTERED RUN` on stderr, `"fullRun": false`) and never counts as a full run. A report with no mismatches prints that and exits 0 without fetching anything.

### Comparing with an earlier run

```bash
npm run validate:public-repos -- --compare corpus-result.json
npm run validate:public-repos -- --compare benchmarks/thresholds.json
```

`--compare <file>` prints what moved since that file. Against an earlier report it lists `ADDED` and `REMOVED` findings per repository and the per-detector true-positive, false-positive, and false-negative differences (`DELTA`), computed over the repositories present in both, so a filtered run compares like with like. Against `benchmarks/thresholds.json` it uses the recorded `lastFullRun` for the per-detector numbers only. Comparing never changes the exit code: false positives, false negatives, and the precision floors still decide it, and an unreadable comparison file is reported without failing the run.

### Managing the cache

A cache of complete checkouts is about 1.5 GB on disk; the default sparse entries need about 570 MB. A suggested location is `~/.cache/evergreen-corpus`; set `EVERGREEN_CORPUS_CACHE` to it in your shell profile.

```bash
npm run corpus:cache -- status                       # directory, entry count, total size, entries no longer in the corpus
npm run corpus:cache -- prune --dry-run              # what removing entries no longer in the corpus would do
npm run corpus:cache -- prune                        # remove entries that are no longer in the corpus
npm run corpus:cache -- prune --max-size 800         # remove least recently used entries until the cache is at most 800 MB
npm run corpus:cache -- prune --all                  # empty the cache
```

`--dry-run` works with every `prune` form and removes nothing. Every cache hit refreshes the entry's last-used time, which is what `--max-size` orders by. The commands only ever touch directories directly under the cache directory whose names look like `<owner>__<repo>@<40-hex commit>`; anything else in there is left alone, and an empty or root-like path (`/`, your home directory, a single top-level directory) is refused.

### Warm ahead, run offline

```bash
npm run corpus:warm                       # fetch every missing checkout into the cache and stop; no scan
npm run corpus:warm -- --ecosystem php    # the same filters as a run
npm run validate:public-repos -- --offline
```

Both need `EVERGREEN_CORPUS_CACHE` and print how many entries were already cached. `--offline` uses the cache only: if an entry is missing it fails before scanning anything, with exit code 2 and one message that lists every missing `repository@commit`. After `corpus:warm`, an `--offline` run reports the same results as an online one. A good habit is `npm run corpus:warm` after pulling `main`, so a later run never waits on a download.

### Running only what a change affects

```bash
npm run validate:public-repos -- --changed            # changes since origin/main, plus uncommitted and untracked files
npm run validate:public-repos -- --changed release/1  # a different base
```

`--changed [base]` reads `git diff --name-only <base>...HEAD` together with uncommitted and untracked files and maps them to corpus ecosystems with [`benchmarks/corpus-affected.ts`](../../benchmarks/corpus-affected.ts): `src/detectors/<name>`, `registry/<file>.json`, and `tests/fixtures/<name>/` map to the ecosystems that detector serves (for example `src/detectors/npm/index.ts` and `registry/nodejs.json` to `node`, the GitHub Actions detector to `node-actions`), and shared files map to every ecosystem whose detectors use them (`src/source-usage.ts` to nine ecosystems; `src/engine/`, `src/sdk.ts`, and the other scan-wide files to all twelve). It prints one `changed:` line per chosen ecosystem naming the paths behind it. If nothing maps, it says so and exits 0 without fetching. The result is a filtered run like any other, and it combines with `--ecosystem` and `--repo`.

The map is tested: every built-in detector, every corpus ecosystem, every directory under `src/detectors/`, every file in `registry/`, and every shared file a detector imports must be listed, so adding a detector fails `npm run check` until it is mapped. Other work can import the same module, for example a pull request workflow.

## Sharding a full run

A full run is split into eight shards, one CI job each, so the run stays inside the nightly budget at the 4,600-repository target. Locally:

```bash
npm run validate:public-repos -- --shard 2/8 --offline
npm run corpus:merge -- --dir shard-reports --output corpus-result.json
```

`--shard <index>/<count>` keeps every `count`th entry starting at `index`, applied after `--ecosystem`, `--repo`, `--failed-from`, and `--changed` have selected the entries. Every entry belongs to exactly one shard and membership is stable for a given corpus order, so two runs pick the same split. The JSON report records `"shard": { "index": 2, "count": 8 }`.

A shard is not a full run: it says `"fullRun": false`, does not enforce the precision or recall floors, and `npm run record:corpus-run` refuses `--shard`. Each shard writes `corpus-result-<shard>.json`. `node dist/benchmarks/corpus-merge.js --dir <dir>` reads exactly the `corpus-result-<n>.json` files, refuses anything that is not the complete set of verify-mode shards, checks every repository against its pinned commit exactly once, merges in corpus order, enforces the floors, and writes the single full report the artifact and the job summary expect. It applies the shard budgets described below.

Each repository is scanned in its own child process with an old-generation heap limit: 1024 MB by default, `--memory-limit <MB>` or `EVERGREEN_CORPUS_MEMORY_MB` to change it. A repository that exceeds the limit, throws, or runs longer than its scan timeout (300 s by default, `EVERGREEN_CORPUS_SCAN_TIMEOUT_SECONDS`) prints as `FAILED owner/repo@commit: reason`, counts its expected findings as missing, and the run carries on to the next repository; the run fails at the end. A fetch that exhausts its retries is recorded the same way, so one repository can neither crash the shard nor hide behind a missing report.

## Run cost and budget

Every report carries a `cost` block: total wall time, the summed fetch time (larger than the wall time when fetches overlap), cache hits and misses, and the size of the git data fetched (git does not expose network bytes, so this is the `.git` size of each fetched checkout). The run prints it as a `COST` line, and the weekly workflow shows it in the job summary.

`benchmarks/thresholds.json` holds the `budget`: a wall-time limit in seconds and a fetched-bytes limit, **per job** — one shard, or one unsharded run. Going over either prints a `BUDGET` warning (a `::warning::` annotation in Actions), lists it in the report's `budgetWarnings`, and flags it in the job summary. A merged report compares its summed fetched bytes against the limit times the shard count and its wall time (the slowest shard) against the single-shard limit. A budget overrun never fails the run; correctness is decided by false positives, false negatives, and failed scans.

The current limits are 600 s and 500 MB per shard, measured rather than guessed. At the 4,600 target a shard owns about 575 repositories, 8.3 times today's 70. A warm shard of 70 takes about 13 s (about two minutes at the target). A cold shard of 70 measured 107.1 s and fetched 53.3 MB here (another run of the same shard took 319.5 s on the same connection), which is about 440 MB for one target shard; decision 0015 measured 112 repositories cold in 49.8 s on an ordinary connection. The 600 s and 500 MB limits leave room for that spread, and the weekly job's timeout is 20 minutes. Tighten the budget in a pull request when a faster fetch strategy lands, and raise it only with a stated reason and a measurement.

## Stalled fetches

One hung connection must not hold a run. Each fetch passes git's low-speed abort (`http.lowSpeedLimit=1000`, `http.lowSpeedTime=30`: below 1 KB/s for 30 s) and a hard limit of 120 s per attempt, changed with `EVERGREEN_CORPUS_FETCH_TIMEOUT_SECONDS`. A stall counts as a failed attempt, so it is retried and, when every attempt fails, recorded as a `FAILED` entry for that repository while the rest of the shard continues. At the end of every run the five slowest fetches print as `SLOWEST` lines.

## Reading a run

By default a run prints a short table on stdout instead of the full JSON: true positives, false positives, false negatives, and precision per ecosystem and per detector, then every `UNEXPECTED`, `MISSING`, and `FAILED` line, then a one-line wall-time summary. Progress goes to stderr as one line per fetched repository (`12/107 owner/name 2.1s`). The `COST`, `SLOWEST`, and `BUDGET` lines follow on stderr.

A `FAILED` line names a repository whose scan or fetch failed (for example its memory limit or its retries) and why. Its expected findings count as missing, and `summary.scanErrors` counts it, so it can never pass as a clean result or disappear from the report.

```bash
npm run validate:public-repos -- --output corpus-result.json   # table on screen, full JSON in the file
npm run validate:public-repos -- --json > corpus-result.json   # JSON on stdout; the table moves to stderr
```

`--output <file>` writes the full JSON report whatever the result, so a failing run still leaves it behind. The weekly workflow uses `--output` and uploads that file as the `corpus-result-<run id>` artifact.

## Recording a full run

```bash
npm run record:corpus-run
```

One command replaces the hand edits. It runs the whole corpus in verify mode and, only when that passes, writes the run into `lastFullRun` in `benchmarks/thresholds.json` (date, the current `HEAD` commit, repository and finding counts, precision, recall, and true positives, false positives, and false negatives for every detector, zero for one that reported nothing), then regenerates a local `docs/dashboard/data.json` preview (`npm run build:dashboard`; gitignored; Pages builds the published copy), the accuracy table below (`npm run build:coverage`), and a local `docs/llms-full.txt` preview (gitignored; Pages builds the published copy). It leaves the tracked changes uncommitted so you can review the diff.

It refuses, and changes nothing, when:

- the working tree has uncommitted changes, because the recorded commit would not describe them;
- any run-narrowing flag is passed (`--ecosystem`, `--repo`, `--failed-from`, `--changed`, `--shard`), or `--observe`, `--warm`, `--output`, `--json`, or `--compare`;
- the run did not cover every corpus entry, was not in verify mode, or has any false positive or false negative, a failed scan, or a detector below its precision floor.

Other harness flags such as `--concurrency` and `--offline` are passed through. Recording runs the corpus in one process, not in shards, because `lastFullRun` is written from a single complete report; the `record` job's 60-minute timeout covers it. The dashboard tests read the recorded commit, counts, and age from `benchmarks/thresholds.json` instead of repeating them, so recording a new run needs no test edits.

## Pull request check

Pull request CI (`ci.yml`) stays offline, so a detector or rule change that adds false positives would only be found in the weekly run. The `affected` job in [`.github/workflows/corpus.yml`](../../.github/workflows/corpus.yml) closes that gap: when a pull request touches `src/`, `registry/`, `tests/fixtures/`, or `benchmarks/`, it maps the changed files to corpus ecosystems with the same `--changed` logic described above and runs only those, using the weekly run's checkout cache (restore only). It always runs unsharded: the pull request keeps a single, affected-ecosystems-only job. The same workflow also covers the full and record modes via schedule and a `mode` `workflow_dispatch` input.

Before it fetches anything, the affected job also runs `node dist/benchmarks/corpus-snapshot.js`, and the same comparison runs in `npm test` for every pull request. [`benchmarks/corpus-snapshot.json`](../../benchmarks/corpus-snapshot.json) records how many findings, in how many repositories, the corpus expects for each detector. A change that removes or weakens an expectation, so that a known finding would no longer be required, fails with a `SNAPSHOT` line until the snapshot is updated on purpose with `node dist/benchmarks/corpus-snapshot.js --write`; that edit is a reviewable diff. Adding expectations never fails; run `--write` to ratchet the snapshot up.

The job summary lists the chosen ecosystems and every `UNEXPECTED` and `MISSING` line; the full report is attached as the `corpus-affected-result-<run id>` artifact. If nothing maps, it says so and fetches nothing. The job is **not a required check**: keep it out of branch protection, because it needs the network and GitHub's availability. It has `contents: read` only, no secrets, and no `pull_request_target`, and the base branch reaches the shell through an environment variable, never an inline expression. Treat a red run as a finding to explain in the pull request, using the rules in "Weekly run and refreshing pins" above.

Drift is invisible until a branch touches the ecosystem. The job only compares the ecosystems the changed files map to, so a finding the detectors report but the ground truth omits sits unnoticed on `main` until an unrelated pull request makes that ecosystem affected (for example, a change under `benchmarks/public-repositories/python/` or `container/`). A red `corpus (affected ecosystems)` job that names a repository your diff does not touch is probably that earlier drift, not your regression: reproduce it on `main` with `--offline --repo <owner/name>` before changing anything, and fix it in its own pull request.

## Keeping `lastFullRun` current

Decision 0013 requires a recorded full run within 30 days for `beta` and `stable`. The `record` job in [`.github/workflows/corpus.yml`](../../.github/workflows/corpus.yml) runs `npm run record:corpus-run` on the 1st and 15th of each month (and on demand with `mode=record`) and opens a pull request with the result. It records nothing when the run has a false positive, a false negative, or a missed floor, so a failed run leaves the old record and a red workflow. A maintainer reviews and merges that pull request; the record is never pushed to `main` directly.

## Weekly run and refreshing pins

Pull request CI never touches the network, so the corpus is checked by the `full` job in [`.github/workflows/corpus.yml`](../../.github/workflows/corpus.yml) every Monday and on demand (Actions → Corpus → Run workflow, `mode=full`). It runs eight shards in parallel, each restoring the shared checkout cache, and a `merge` job joins their reports into one full run; if any shard fails, the merge job does not run and no full result is published. The merged result is uploaded as the `corpus-result-<run id>` artifact even when it has mismatches. A failing run prints one line per mismatch, for example:

```text
UNEXPECTED owner/repo@4ec1ebe0fa: github-actions.setup-node.node20:.github/workflows/ci.yml:20
MISSING    owner/repo@4ec1ebe0fa: nodejs.runtime.eol-18:package.json:83
FAILED     owner/huge@4ec1ebe0fa: scan exceeded the 1024 MB per-repository memory limit
```

`UNEXPECTED` means Evergreen reported a finding the corpus does not list; `MISSING` means a listed finding was not reported. Because every commit is pinned, a mismatch means Evergreen's rules or detectors changed, not the repository. Decide which side is right before touching the corpus: fix the detector or rule when the corpus is right, and update the expected entry (with its `groundTruthSource`) only when the new result is correct.

To move an entry to a newer commit, change its `commit` to the full 40-character SHA, run `npm run observe:public-repos` to list what Evergreen now reports, review every difference against the repository at that commit, update `expected`, and run `npm run validate:public-repos` until it passes. Never refresh a pin only to make a failing run green.
