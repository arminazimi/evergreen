---
title: Continuous integration
description: What Evergreen runs on pull requests, the merge queue, main, nightly schedules, and release, with the single required check, a time budget for each lane, and a runbook for the failures CI actually shows.
---

# Continuous integration

This page is the CI design for this repository. It says which lane runs what, how long each lane
may take, and which status check branch protection requires. The proposal is recorded in
[decision 0024](decisions/0024-ci-lanes.md). That record is **proposed**: these lanes become the
standard when the maintainer accepts them. Later tasks in epic [#1985](https://github.com/arminazimi/evergreen/issues/1985)
change workflows to match this page; until then, a workflow may still differ from the target below.

Scans in this repository stay offline. No CI lane adds network access to the scan engine.

## Single required check

Branch protection and the merge queue require **one** status check: **`ci-ok`**.

`ci-ok` is a job in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml). It runs after the
other jobs in that workflow, fails when any needed job failed or was cancelled, and passes when
every needed job succeeded or was skipped. Keep individual jobs, the public corpus, Scorecard,
fuzz, mutation, and package smoke **out** of the required list so the matrix can change without
editing repository settings.

How to turn the check and the merge queue on: [MAINTAINERS.md](../MAINTAINERS.md#branch-protection-and-the-merge-queue).
Contributor-facing note: [CONTRIBUTING.md](../CONTRIBUTING.md#quality-standards).

## Lanes at a glance

| Lane | Trigger | Purpose | Wall-clock budget | Required to merge? |
| --- | --- | --- | --- | --- |
| Pull request | `pull_request` | Fast feedback for authors | **25 minutes** | No — informs review; `ci-ok` on the PR is useful but the queue is the landing proof |
| Merge queue | `merge_group` | Proof that may land on `main` | **30 minutes** | Yes — `ci-ok` must pass; the run is never cancelled |
| Main | `push` to `main` | Post-merge side effects only (after the queue is the only path) | **15 minutes** | N/A — already merged |
| Nightly | `schedule` / `workflow_dispatch` | Expensive, network, or slow signals | **60 minutes** per workflow | No |
| Release | tag / publish chain | Verify, build, publish, smoke | **45 minutes** for the chain | N/A — gated by the release checklist |

A job's `timeout-minutes` must fit its lane. Raising a lane budget, or moving work between lanes,
updates this page in the same change as the workflow edit.

## Runner-minute budget (325)

Wall-clock time is not the only cost. A pull request also spends **runner minutes**: for each job,
its `timeout-minutes` times the number of jobs its matrix expands to, summed over every workflow
that can start on `pull_request`. The budget is **325 runner minutes**, the ceiling measured on
2026-11-04. [`ci.yml`](../.github/workflows/ci.yml) is the largest part: four `check` shards at
20 minutes each, `coverage`, the Windows cross-OS run, `docs`, and the small jobs.

`npm run check` runs [`tools/check-workflow-change.ts`](../tools/check-workflow-change.ts), which
recomputes the ceiling from the workflow files and fails above the budget. It is offline: it reads
the workflows, git history, and the event payload file Actions already writes. A job without
`timeout-minutes` is charged the 25-minute pull-request lane budget, so a new job cannot hide its
cost. Matrix `include` entries and dynamic `fromJSON` dimensions count as one job, so the number is
a ceiling rather than an estimate of a particular run.

When a pull request changes a workflow under `.github/workflows/`, it must also fill in the
**Workflow changes** section of the [pull request template](../.github/pull_request_template.md):
the reason, and the effect on this budget (for example `+20 runner minutes`, `-5`, or `none`). The
check compares the stated effect with the measured change. A workflow change without the note
fails, and a note that understates the effect fails too. The note is enforced on `pull_request`
runs, where the body exists; the merge queue has no pull-request body and re-runs only the budget.

Raising the budget is a design change: update this page and
`PULL_REQUEST_RUNNER_MINUTE_BUDGET` in the tool in the same pull request, and say why in the note.
Do not raise it to make a single change pass.

## Pull request (25 minutes)

**Goal.** Catch failures early without pretending the pull request is the landing proof.

**Always (code changes).**

- Classify docs-only vs code ([`ci.yml`](../.github/workflows/ci.yml) `changes` job).
- `npm run check` on Ubuntu with Node 24 and Node 22.
- Run only the test files a change can reach, from an import map
  ([`tools/run-tests-selection.ts`](../tools/run-tests-selection.ts)); the `coverage` job still measures the
  whole suite on every pull request. Shared paths, configuration, fixtures, the registry, and the
  map's own code run everything.
- `npm run check` on Windows with Node 24 (path and line-ending bugs before merge).
- Quality gate against `origin/main`, dependency audit, Action cold-start budget, generated docs
  and data checks, coverage floors and per-file coverage diff — on the Linux Node 24 job.
- Dogfood the Action against this repository's baseline on that same job.
- Pack the npm tarball on Linux and on the cross-OS runner and compare the hashes in `ci-ok`, so a
  build step that depends on the host — a path, a line ending, a file-ordering difference — fails
  before merge (`record:reproducible`, [`compare-build-hashes.mjs`](../tools/compare-build-hashes.mjs)).
- Decision-record presence when `schemas/`, `src/sdk.ts`, or `src/mcp.ts` change
  ([`decisions.yml`](../.github/workflows/decisions.yml)).
- Rules lint when registry files change ([`rules.yml`](../.github/workflows/rules.yml)).
- The [runner-minute budget](#runner-minute-budget-325) on every `npm run check`, plus the
  workflow-change note when `.github/workflows/` changes
  ([`tools/check-workflow-change.ts`](../tools/check-workflow-change.ts)).

**Docs-only pull requests.** Skip the test matrix. Build and check reference pages, verify
`llms-full.txt`, `dashboard/data.json`, and `api/v1` are buildable, generate `llms-full.txt`,
`sitemap.xml`, `rules/index.md`, `dashboard/data.json`, and `api/v1` for the Jekyll site, and build
the site instead.

**When site files change** (`docs/` site sources, theme config, and Lighthouse config).

- Site budget, docs doctor, and related site checks, through the `paths` filters on those
  workflows (`docs/**`, `lighthouserc.json`, and the workflow file itself).
- Do **not** run Lighthouse or Seaworthy on unrelated code-only pull requests: `site-budget.yml`
  and `docs-doctor.yml` do not start, and `site-budget`/`docs-doctor` in `ci.yml` only run on
  `merge_group`.

**Never required on the pull request itself.**

- Full public corpus, mutation testing, Scorecard, scheduled fuzz, importers, source freshness.
- Affected-ecosystem corpus ([`corpus.yml`](../.github/workflows/corpus.yml) `affected` job) may run
  for signal; it stays **non-required** because it needs the network.

**Concurrency.** A newer push to the same pull request may cancel the older run.

## Merge queue (30 minutes)

**Goal.** Everything a commit on `main` must have passed, on the exact merge result.

**Runs.**

- The full code gate from the pull-request lane, including Windows — and the whole test suite,
  never the affected subset the pull-request lane runs.
- macOS with Node 24 (`check-cross-os`), because that runner is scarce and belongs on the landing
  proof rather than every pull-request push. Its tarball hash joins the Linux and Windows records,
  so the merge-queue comparison covers all three runners.
- Self-scan: fail on findings outside `.evergreen-baseline.json`.
- Performance budget on the fixed fixture.
- Package smoke (npm tarball, Docker image, local Action) when the lane still lists it on
  `merge_group`.
- Site jobs (Lighthouse, Seaworthy, site budget, docs doctor) **when the queued change touches site
  files**; otherwise those jobs skip and `ci-ok` still passes. `ci.yml` calls `site-budget.yml` and
  `docs-doctor.yml` from `merge_group` because the queue ignores `paths`; `changes.site` decides.
- `ci-ok` aggregates the above.

**Rules.**

- Never cancel a `merge_group` run for a newer push.
- The merge queue is the only path to `main` once #2029 is done; until then, treat a green queue
  run as the intended proof even if direct merges still exist.
- Do not put corpus, mutation, or Scorecard into the queue budget.

## Main (15 minutes)

**Goal.** After the merge queue is the only path, do not re-prove the same gate on every push.

**Target (after #2029 and #2030).**

- Badge publish to the `badges` branch.
- Pages deploy **once per merge batch**, not once per commit (#2031).
- Any remaining release-branch Action bundle build the release chain still starts from `main`.
- Do not cancel a `main` run that is the only verification left for a commit. Report cancelled
  share; keep it under 5%.

**Until the queue is enforced.** Keep the full `ci.yml` gate on `push` to `main` so history stays
covered. That transitional cost is accepted; removing it is #2030's job after #2029.

## Nightly and scheduled (60 minutes per workflow)

**Goal.** Signals that are too slow, too flaky, or too network-heavy for the merge path.

| Work | Workflow (today) | Cadence (today) |
| --- | --- | --- |
| Mutation testing | `mutation.yml` | Nightly |
| Parser fuzz (scheduled) | `fuzz.yml` | Nightly (+ optional PR path filter) |
| Package smoke (scheduled) | `package-smoke.yml` | Nightly |
| CI health / quarantine | `ci-health.yml` | Nightly + weekly |
| Full public corpus | `corpus.yml` (`full`) | Weekly |
| Record full corpus | `corpus.yml` (`record`) | Twice monthly |
| Source freshness | `sources.yml` | Weekly |
| Lifecycle importers | `importers.yml` | Weekly |
| Scorecard + floor | `scorecard.yml`, `scorecard-floor.yml` | Weekly |
| CodeQL (scheduled scan) | `codeql.yml` | Weekly (also runs on every PR and main push) |
| Open alerts gate | `open-alerts.yml` | Push to main + daily |
| MCP listings | `mcp-listings.yml` | Weekly |
| Label sync | `labels.yml` | Weekly + path pushes |

The scheduled runs must not be required status checks. A red nightly run opens follow-up work; it does not block
a green queue. Affected, full, and record corpus runs live in one file (`corpus.yml`) with a
`mode` input for `workflow_dispatch`.

## Release (45 minutes)

**Goal.** One chain: verify → build → publish each channel → smoke. A failed stage is safe to rerun.

**In scope.**

- Changelog notes and gates in [RELEASING.md](RELEASING.md).
- npm publish with provenance.
- Action bundle on `release/<tag>` (not on `main`).
- Standalone binaries, signatures, attestations.
- Quickstart smoke against the published package.
- Container and Homebrew channels the release docs list.
- Data-bundle release when registry data changes ([`data-release.yml`](../.github/workflows/data-release.yml)).

**Stages.** `release.yml` is a thin orchestrator that calls reusable stage workflows (verify, build,
publish per channel including npm via the `npm-publish` job, smoke). A version tag runs the full chain in
one workflow run so a failed stage is safe to re-run. A manual run with `dry_run` exercises every
stage and publishes nothing. Those tasks keep this lane's budget and the rule that `main` does not
carry the Action bundle.

## Failure runbook

This section is the runbook for red CI: what each common failure looks like in the logs, why it
happens, and what to do. It documents `main` as it is today; if a later task renames a step, update
both the workflow and this page.

### Start at `ci-ok`

`ci-ok` is the only required check, and its own log never explains the failure — it only says that a
needed job failed or was cancelled:

```
::error::A job that ci-ok needs failed or was cancelled.
```

To find the real failure:

```bash
gh run list --workflow ci.yml --limit 10              # which runs went red
gh run view <run-id>                                  # job-by-job results
gh run view <run-id> --log-failed                     # only the failed steps' logs
```

`--log-failed` is the fastest path: every entry below is keyed to the step name it prints under.
A `cancelled` result usually means a newer push cancelled an older pull-request run (allowed by the
concurrency rule in the Pull request lane); that is not a failure to fix, and re-running the newest
run is enough.

### What actually fails (measured 2026-11-03)

366 workflow runs concluded `failure` in the 30 days up to the 2026-11-03 audit (earliest failure
in the window: 2026-10-15). By workflow:

| Workflow | Failed runs | Where this runbook covers it |
| --- | --- | --- |
| CI | 218 | Entries below |
| `corpus.yml` (affected ecosystems) | 51 | Nightly and scheduled signal, not a gate |
| `pages.yml` (pages build and deployment) | 42 | Broken documentation site build |
| `rules.yml` (Rules (changed)) | 14 | Rule fixtures are missing or contradict the rule |
| `workflow-lint.yml` | 13 | Workflow lint runs after merge |
| Everything else (17 workflows, 28 runs) | 28 | Source freshness, site budget, mutation, package smoke, … |

Re-derive the tally with (paging through the API because `gh run list` caps a single call):

```bash
gh api "repos/arminazimi/evergreen/actions/runs?per_page=100&status=failure&created=>2026-10-04" \
  --paginate --jq '.workflow_runs[] | [.name, .created_at] | @tsv'
```

Inside the CI workflow, 27 sampled failed runs in that window had these failing steps (a run counts
once per failed step; `ci-ok` is the aggregate and appears in all 27):

| Failing step | Sampled runs |
| --- | --- |
| `check` job → `npm run check` | 16 |
| `self-scan` job → `Scan this repository with the code under test` | 8 |
| `coverage` job → `Coverage diff for changed src files` | 5 |
| `check` job → `Dogfood Evergreen action` | 2 |
| `coverage` job → `Enforce coverage floors` | 1 |
| `check` job → `Guard the quality gate against main` | 1 |
| `check` job → `Audit dependencies (runtime, then the full lockfile)` | 1 |
| `seaworthy` job → `Run arminazimi/seaworthy@…` | 1 |

The sample covers the most recent failed CI runs at audit time, not all 218 — treat the percentages
as direction, not a service-level figure.

### A test fails inside `npm run check`

**Symptom.** The `npm run check` step ends with a line naming the failed pipeline step, for example:

```
test: node tools/run-tests.mjs exited 1
```

Above it, the failing test file and assertion. The Linux `check` job runs as two time-balanced
shards per Node version (`check (ubuntu-latest, node 24, shard 0)` and so on); a shard number only
says which runner found the failure — the same files run unsharded locally.

**Cause.** A genuine assertion failure in the suite, or a build/type error that makes the suite
unrunnable.

**Fix.** Reproduce locally — the same pipeline runs with `npm run check`, and one file alone runs
with `npm run test -- dist/tests/<name>.test.js` (the `test` script builds first). Fix the code or
the test, not the threshold: `npm run check` runs everything the gate runs, and skipping,
quarantining, or loosening is not a fix an author may make to get a merge.

### Tests pass on retry (flaky)

**Symptom.** The run is green, but the step summary lists:

```
Failed once, then passed on a single retry:
```

**Cause.** [`tools/run-tests.mjs`](../tools/run-tests.mjs) re-runs a failed test file once in CI and
reports single-retry passes as flaky. Flakiness is real signal, not noise to swallow.

**Fix.** Open an issue naming the file, reproduce with the same command under load, and fix the
test. The weekly `ci-health` run lists what has been flaky this week
(`node tools/run-tests.mjs --list-weekly-flaky`). Only an open issue buys a test a quarantine
entry in [`tests/quarantine.json`](../tests/quarantine.json); quarantined files are skipped on
`pull_request`/`merge_group` and still run nightly via `node tools/run-tests.mjs --quarantine-only`.
Details: [TESTING.md — Quarantine and flaky tests](TESTING.md#quarantine-and-flaky-tests).

### Red on Windows only (`check (windows-latest, node 24)`)

**Symptom.** Linux `check` jobs are green; the `check-cross-os` job's Windows matrix entry fails
the same `npm run check` step.

**Cause.** Path separators, line endings, or case-sensitive filesystem assumptions that Linux and
macOS do not see.

**Fix.** Run the failing test on Windows (a local Windows box or a throwaway branch). Watch out for
`core.autocrlf` locally: CI forces `git config --global core.autocrlf false` because tests apply
patches in temporary repositories, and a local `true` can hide or manufacture exactly this failure.

### Coverage floors missed (`Enforce coverage floors`)

**Symptom.** The `coverage` job prints:

```
Coverage floors failed.
lines: 92.4% (floor 93) FAIL
```

The step prints one `metric: percent (floor N) ok|FAIL` row for every metric it checks. Floors live
in `package.json` under `coverageFloors` (today 93 lines / 87 branches / 93 functions) and pull
requests must meet the same floors as `main`.

**Cause.** New or changed `src/` code the suite does not exercise. Coverage is collected once, in
the unsharded `coverage` job (`EVERGREEN_CHECK_COVERAGE=1`), so the report you are judged by is the
one from `node tools/run-tests.mjs` with coverage on.

**Fix.** Add tests for the uncovered paths; reproduce with `npm run test:coverage`. Lowering a floor
in `package.json` is not an author-side fix — floors are a repo-wide decision for maintainers, in a
separate reviewed change.

### Coverage fell against `main` (`Coverage diff for changed src files`)

**Symptom.** Either the changed files' per-file report (written by `dist/tools/coverage-diff.js`
into the step summary), or a total dropping below main's:

```
branches is 86.9%, below main's 87.4%.
```

Or, when the report itself is missing:

```
::error::The coverage run did not write lcov.info; the per-file coverage diff cannot run.
```

**Cause.** The diff compares this run's `lcov.info` with the artifact from the latest successful
`main` run and flags per-file regressions and totals below main's report (with a small rounding
tolerance). The `::error::` line means the coverage run produced no `lcov.info` at all.

**Fix.** Cover the files you changed. If a genuinely dead path was removed and that moved a
percentage, explain the numbers in the PR description and let review decide; do not edit floors.

### Quality gate loosened (`Guard the quality gate against main`)

**Symptom.** The step (`node dist/tools/check-quality.js --against origin/main`) prints findings in
the form:

```
gate: TARGETS.<limit>: limit loosened from <old> to <new>; the quality gate may only tighten against the base ref
gate: fileSize: src/<file>.ts: lines raised from <old> to <new>; the allowlist may only shrink against the base ref
gate: <section>: <key>: new allowlist entry; remove it or fix the debt instead of raising the gate
```

followed by `quality gate: allowlist and TARGETS hold against origin/main` only when everything
holds.

**Cause.** The PR edits `benchmarks/quality-allowlist.json` or the checker's `TARGETS` table (in
`tools/check-quality.ts`, which `--against` reads from both refs) in any way that relaxes a limit
against `origin/main` — a raised ceiling, a later expiry, a new entry, or a loosened numeric
target. The gate may only tighten.

**Fix.** Restore the committed values and fix the underlying debt. Allowlist changes that loosen
limits are maintainer decisions and belong in their own change, not bundled into a feature PR. See
[QUALITY.md](QUALITY.md).

### Dependency advisory (`Audit dependencies (runtime, then the full lockfile)`)

**Symptom.** Either `npm audit --omit=dev --audit-level=low` fails, or the checker reports:

```
moderate advisory 1234 is not allowlisted; update the dependency or add an entry with an owner and expiry
```

**Cause.** The runtime dependency tree must have **no** advisory at any level. The full lockfile may
carry only the specific advisories listed in `benchmarks/quality-allowlist.json`; high and critical
advisories always fail, allowlisted or not.

**Fix.** `npm audit` locally, bump or replace the dependency (`npm install <pkg>@<version>`; let npm
touch `package-lock.json`, never hand-edit it). A dev-only moderate/low advisory that cannot be
fixed yet needs an allowlist entry with an owner and expiry, added through its own PR.

### Evergreen finds something new in its own repository

**Symptom.** Two steps can fail this way: `Scan this repository with the code under test` (the
`self-scan` job, on merge queue and `main`) prints one `::error::` line per finding:

```
::error::<rule-id> <finding-id>: new finding not covered by .evergreen-baseline.json
```

and `Dogfood Evergreen action` (the `check` job, Linux shard 0) fails when the action under test
scans the checkout and finds high-or-worse issues outside the baseline.

**Cause.** The change introduced a lifecycle-risk finding in this repository's own files that
`.evergreen-baseline.json` does not cover — usually a dependency EOL bump or a risky pattern added
to source or workflows.

**Fix.** Remove or fix the offending usage; that almost always means the change itself. Adding a
baseline entry is a deliberate, separately reviewed change to `.evergreen-baseline.json`, not a way
to silence a merge you dislike.

### Merge markers built into `main`

**Symptom.** `npm run check` fails during the build with lines like:

```
error TS1185: Merge conflict marker encountered.
```

**Cause.** A conflict was resolved by keeping both sides and committed. The suite proves this cannot
survive even one job; if it reached `main`, bisect to the merge commit.

**Fix.** Resolve properly, rebuild (`npm run build`), push. On `main`, this is a revert-and-remerge,
not a follow-up patch.

### Generated docs out of date

**Symptom.** One of the `Check … against the registry` steps (reference pages, Open Graph images,
answer pages) or the buildability checks fails with lines like:

```
stale: docs/rules/<rule-id>.md
<file>: generated content differs
missing generated file
```

**Cause.** A registry change landed without regenerating the committed docs it drives.

**Fix.** Regenerate with the matching script from `package.json` — `npm run build:reference`,
`npm run build:og-images`, `npm run build:answer-pages` — and commit the tracked outputs. Never
hand-edit generated files, and never commit the ones `.gitignore` owns (`docs/llms-full.txt`,
`docs/sitemap.xml`, `docs/rules/index.md`, `docs/dashboard/data.json`, `docs/api/v1/`; they are
built at site-build time).

### Missing decision record (`decisions.yml`)

**Symptom.** The Decisions check reports:

```
Public contract changed without a decision record:
```

followed by the changed paths.

**Cause.** The PR touches `schemas/`, `src/sdk.ts`, or `src/mcp.ts` — public contract surfaces —
without adding a new record under `docs/decisions/`.

**Fix.** Write the decision record in this PR (see the existing numbering; one file per decision,
status included). If you believe the change is not a contract change, say so on the PR and get the
path filter adjusted through maintainers — do not rename files to dodge the filter.

### Rule fixtures missing or contradicting (`Rules (changed)`)

**Symptom.** The `rules.yml` job's `Lint and test the changed rules` step prints, per rule:

```
Failed <rule-id> (registry/<file>.json)
  match: expected at least one finding for "<rule-id>"; got none.
```

or

```
  clean: expected no findings for "<rule-id>"; got 3.
```

or

```
  match: missing fixture: tests/fixtures/<rule-id>/match is not a directory. Create both tests/fixtures/<rule-id>/match and clean; see docs/RULES.md.
```

**Cause.** Every rule the diff touches must have `tests/fixtures/<rule-id>/match` (where the rule
must fire) and `.../clean` (where it must not). Editing a rule's matchers without its fixtures — or
fixtures without the rule — fails here.

**Fix.** Add or correct the fixture directories; see [RULES.md](RULES.md) for the fixture contract.
New rules scaffold them via `evergreen new-rule`.

### Workflow lint runs after merge (`Workflow lint`)

**Symptom.** A `push`-triggered `Workflow lint` run on `main` is red — actionlint findings from
`Lint the workflows with actionlint`, or zizmor exiting 14 on
`Audit the workflows and the Action with zizmor`.

**Cause.** `workflow-lint.yml` triggers on pushes to `main` and manually, **not** on pull requests,
so a bad workflow edit first shows up after it landed.

**Fix.** Repair in a follow-up PR. Suppress a deliberate, explained pattern inline with
`# zizmor: ignore[rule] -- reason`. Because this workflow is not part of `ci-ok`, its red does not
block merges — but repeated red here means lint should move into the PR lane, which would update
this page.

### Broken documentation site build (`pages build and deployment`, `docs doctor`, docs job)

**Symptom.** The `Build the documentation site` step fails with a Jekyll/Ruby stack trace from
`bundle exec jekyll build`. Second-most-failing workflow in the 30-day window above.

**Cause.** Bad front matter, Liquid errors, or a docs source the site build cannot process. The
docs-only path of `ci.yml` builds the same site, so this usually also fails pre-merge — unless the
breaking change reached `main` through another path. A red `docs doctor` run means the same thing:
the doctor's own findings are report-only (`level: none`), so only the site build can turn it red.

**Fix.** Reproduce with `cd docs && bundle exec jekyll build --baseurl ""` and fix the docs source.
Jekyll config and theme changes belong in site-focused PRs.

### Seaworthy fails on the built site (`seaworthy` job)

**Symptom.** The `Run arminazimi/seaworthy@…` step in `pages.yml` fails on the deployed-site
checks.

**Cause.** A site change broke navigation, links, or the crawl expectations Seaworthy encodes.

**Fix.** Reproduce against the built site locally if possible; otherwise the `pages.yml` run's
artifact (`docs-site`) is the thing to inspect. Seaworthy is not part of `ci-ok`, so this is a
follow-up-work signal, not a merge blocker.

### Site budget exceeded (`Site budget`)

**Symptom.** `Measure the pages against the budgets` (`@lhci/cli autorun --config=lighthouserc.json`)
reports assertion failures such as:

```
largest-contentful-paint failure for maxNumericValue assertion.
```

with budgets: LCP 2500 ms, total page weight 163840 bytes, document size 40960 bytes.

**Cause.** A docs page grew past its Lighthouse budget — heavy inline content, new scripts, or
images.

**Fix.** Slim the page (split content, drop weight). Editing `lighthouserc.json` to move a budget is
a maintainer decision like any other gate loosening. In the merge queue the `site-budget` job is
part of `ci-ok`, so the queue will not land a site change that exceeds a budget.

### `main` is red

**Symptom.** An issue titled **"main is red: CI is failing"** with label `area: devops` exists and
accumulates updates.

**Cause.** `ci-health.yml` watches every failed CI push run on `main` (via `workflow_run`) and
maintains exactly one such issue. It closes itself once `main`'s CI goes green.

**Fix.** Triage from the issue's body: it lists the failing runs and steps. Treat a red `main` as
top priority — every later merge queue inherits the doubt. Do not open a second red-main issue by
hand, and do not re-run the failing `main` commit hoping for green; fix forward or revert.

### Nightly and scheduled signal, not a gate

Red `corpus.yml` (affected, full, or record), `mutation.yml`, `sources.yml`, `importers.yml`,
`scorecard.yml`, scheduled CodeQL, or MCP-listing runs **never block a green queue** — see the Nightly lane
and [What this design deliberately leaves out](#what-this-design-deliberately-leaves-out-of-the-merge-gate).
The affected-corpus job was the second-heaviest failure source in the 30-day window above; it needs
the network, so its red is signal rather than a merge blocker, and what it means (upstream flakiness
vs a detector regression) has to be read from the job log, not assumed. A red nightly run opens
follow-up work (an issue) rather than blocking a merge; a *repeatedly* red nightly source is itself
a bug worth filing. Full-corpus validation lives in [VALIDATION.md](VALIDATION.md); warm the corpus
fixtures locally with `npm run corpus:warm` and check the tracked repositories with
`npm run validate:public-repos`.

### Release chain

**Symptom.** A `release.yml` run on a `v*` tag fails in one of its stages; `publish.yml` never runs
on its own (`workflow_call` from `release.yml` only; it runs package smoke and the MCP Registry after the `npm-publish` job).

**Cause.** Verify, build, per-channel publish (npm, binaries, container, Homebrew, data bundle), or
smoke failed. Stages receive the audited `release_sha` (since #2340), so a mid-chain failure cannot
silently publish a newer commit.

**Fix.** The chain is designed so a failed stage is safe to re-run: `gh run rerun <run-id> --failed`
resumes from the failed stage. Read [RELEASING.md](RELEASING.md) before retrying anything that
publishes; a manual `dry_run` run exercises every stage and publishes nothing. Whether a specific
published channel completed is not measurable from the runbook — check the run's stage logs.

## What this design deliberately leaves out of the merge gate

- Network corpus validation.
- Mutation score (gated separately per [QUALITY.md](QUALITY.md) once measured).
- OpenSSF Scorecard floor (scheduled alert until the score meets the quality target).
- Marketplace-only publish steps.

## Workflow inventory

Every file under [`.github/workflows/`](../.github/workflows/) belongs to a lane above and has a
stated purpose. **Owner** for all of them is [@arminazimi](https://github.com/arminazimi)
([`.github/CODEOWNERS`](../.github/CODEOWNERS) `/.github/workflows/`). Count after #2025: **33**
files (`corpus-pr.yml` and `corpus-record.yml` folded into `corpus.yml`).

A last-run audit on 2026-11-03 found no unused workflows to delete. Empty run history is expected
for `evergreen-reusable.yml` (only `workflow_call`, runs in caller repositories) and for
`scorecard-floor.yml` (added 2026-11-02; first cron is Saturday). Do not delete a workflow here
just because a later task will fold it.

| File | Lane | Trigger | Purpose |
| --- | --- | --- | --- |
| `ci.yml` | Pull request / merge queue / main | `pull_request`, `push` to `main`, `merge_group` | Main gate: classify docs vs code, `npm run check` matrix, quality, self-scan path, and the required `ci-ok` aggregator |
| `decisions.yml` | Pull request | `pull_request` on contract paths | Fail when a public-contract change lacks a decision record |
| `rules.yml` | Pull request / main | `pull_request` / `push` on registry paths | Lint and fixture-test only the rules the diff touches |
| `docs-doctor.yml` | Pull request / merge queue | `pull_request` on docs site paths; `workflow_call` from `ci.yml`; `workflow_dispatch` | Slipway doctor on the documentation site (report-only until the site is clean) |
| `site-budget.yml` | Pull request / merge queue | `pull_request` on site paths; `workflow_call` from `ci.yml`; `workflow_dispatch` | Fail when the docs site exceeds size or LCP budgets |
| `fuzz.yml` | Pull request / nightly | `pull_request` on parser paths; nightly schedule; `workflow_dispatch` | Deeper parser fuzz than the tight budget inside `npm run check` |
| `workflow-lint.yml` | Main | `push` to `main` on workflow paths; `workflow_dispatch` | actionlint + zizmor on workflow YAML and `action.yml` |
| `pages.yml` | Main | `push` to `main`; `workflow_dispatch` | Build the docs site, Seaworthy + Lighthouse, deploy to GitHub Pages |
| `labels.yml` | Main / nightly | `pull_request` / `push` on label paths; weekly schedule; `workflow_dispatch` | Sync `.github/labels.yml` and check good-first-issue briefs |
| `release.yml` | Main / release | `push` to `main`; version `v*` tags; `workflow_dispatch` | One release chain: Action bundle on `release/<tag>`, npm via the `npm-publish` job, binaries, provenance, channels, smoke |
| `package-smoke.yml` | Merge queue / nightly | `merge_group`; nightly schedule; `workflow_dispatch` | Prove npm tarball, Docker image, and local Action scan the same fixture |
| `ci-health.yml` | Nightly | `workflow_run` of CI on `main`; schedules; `workflow_dispatch` | Open/close devops issues on main failures, measure CI duration, quarantine flaky tests |
| `mutation.yml` | Nightly | Nightly schedule; `workflow_dispatch` | Mutation testing matrix (too slow for the merge gate) |
| `corpus.yml` | Pull request / main / nightly | `pull_request` / `push` on detector paths; weekly + twice-monthly schedules; `workflow_dispatch` with `mode` (`affected` / `full` / `record`) | Affected-ecosystem signal, full public corpus validate, and recorded full-run PR |
| `sources.yml` | Nightly | Weekly schedule; `workflow_dispatch` | Evidence URL reachability and rule freshness windows |
| `importers.yml` | Nightly | Weekly schedule; `workflow_dispatch` | Draft lifecycle rules from authoritative sources; open one PR per importer |
| `scorecard.yml` | Nightly | Weekly schedule; `branch_protection_rule`; `workflow_dispatch` | OpenSSF Scorecard publish + SARIF upload |
| `scorecard-floor.yml` | Nightly | Weekly schedule (after Scorecard); `workflow_dispatch` | Alert when the published Scorecard score is below the QUALITY.md floor |
| `codeql.yml` | Pull request / main / nightly | Every `pull_request`; `push` to `main`; weekly schedule; `workflow_dispatch` | CodeQL analysis of every proposed change and `main` |
| `open-alerts.yml` | Push to main | Push to `main`; daily schedule; `workflow_dispatch` | Fail on any open code-scanning or Dependabot alert on `main` that `tools/open-alerts-baseline.json` does not accept |
| `mcp-listings.yml` | Nightly | Weekly schedule; `workflow_dispatch` | Compare tracked MCP directory listings to `server.json` |
| `publish.yml` | Release | `workflow_call` from `release.yml` | package smoke and MCP Registry (the npm publish itself is in `release.yml`) |
| `data-release.yml` | Release | `data-v*` tags; dry-run `workflow_dispatch` | Build, sign, and publish the lifecycle data bundle |
| `gitlab-sync.yml` | Release | `v*` tags; `workflow_dispatch` | Push the release commit and tags to the GitLab CI/CD Catalog project |
| `evergreen-reusable.yml` | Product (caller) | `workflow_call` only | Reusable per-repository Evergreen scan for other repositories to `uses:` |
| `org-scan.yml` | Product (caller) | `workflow_call`; `workflow_dispatch` | Organization-wide scan, rollup, and optional Slack/Teams digest |

### Last-run audit (2026-11-03)

Checked with `gh run list --workflow <file> --limit 1` against `arminazimi/evergreen`.

| Outcome | Workflows |
| --- | --- |
| Ran successfully within about a week | `ci.yml`, `ci-health.yml`, `codeql.yml`, `corpus.yml`, `decisions.yml`, `docs-doctor.yml`, `fuzz.yml`, `gitlab-sync.yml`, `labels.yml`, `mcp-listings.yml`, `package-smoke.yml`, `pages.yml`, `publish.yml`, `release.yml`, `rules.yml`, `scorecard.yml`, `site-budget.yml`, `workflow-lint.yml` |
| Ran (failed — still active signal, not unused) | `mutation.yml` (nightly), `sources.yml` (nightly), `org-scan.yml` (manual/product path) |
| Older success, still on its trigger | `data-release.yml` (last `data-v*` / release-related push 2026-10-21), `importers.yml` (last schedule 2026-10-27) |
| No runs in this repository (expected) | `evergreen-reusable.yml` (`workflow_call` only), `scorecard-floor.yml` (first Saturday cron not yet due) |

## Changing this page

- **Accepted design.** After decision 0024 is accepted, workflow pull requests that move work
  between lanes or raise a budget update this page in the same change.
- **Inventory.** When you add, rename, delete, or change the purpose of a workflow file, update the
  [Workflow inventory](#workflow-inventory) table in the same pull request.
- **Workflow changes.** A pull request that edits `.github/workflows/` fills in the
  [pull request template](../.github/pull_request_template.md) section and keeps the
  [runner-minute ceiling](#runner-minute-budget-325) at or below the budget.
- **Shared setup.** Checkout-independent Node install and cache move into one composite action in
  #2026; lanes above stay the same.
