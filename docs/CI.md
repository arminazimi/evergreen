---
title: Continuous integration
description: What Evergreen runs on pull requests, the merge queue, main, nightly schedules, and release, with the single required check and a time budget for each lane.
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

## Pull request (25 minutes)

**Goal.** Catch failures early without pretending the pull request is the landing proof.

**Always (code changes).**

- Classify docs-only vs code ([`ci.yml`](../.github/workflows/ci.yml) `changes` job).
- `npm run check` on Ubuntu with Node 24 and Node 22.
- `npm run check` on Windows with Node 24 (path and line-ending bugs before merge).
- Quality gate against `origin/main`, dependency audit, Action cold-start budget, generated docs
  and data checks, coverage floors and per-file coverage diff — on the Linux Node 24 job.
- Dogfood the Action against this repository's baseline on that same job.
- Decision-record presence when `schemas/`, `src/sdk.ts`, or `src/mcp.ts` change
  ([`decisions.yml`](../.github/workflows/decisions.yml)).
- Rules lint when registry files change ([`rules.yml`](../.github/workflows/rules.yml)).

**Docs-only pull requests.** Skip the test matrix. Build and check reference pages, verify
`llms-full.txt` is buildable, generate `llms-full.txt`, `sitemap.xml`, and `rules/index.md` for the
Jekyll site, and build the site instead.

**When site files change** (`docs/` site sources, theme config, Lighthouse config, and the paths
later tasks pin).

- Site budget, docs doctor, and related site checks.
- Do **not** run Lighthouse or Seaworthy on unrelated code-only pull requests (target; see #2032).

**Never required on the pull request itself.**

- Full public corpus, mutation testing, Scorecard, scheduled fuzz, importers, source freshness.
- Affected-ecosystem corpus ([`corpus.yml`](../.github/workflows/corpus.yml) `affected` job) may run
  for signal; it stays **non-required** because it needs the network.

**Concurrency.** A newer push to the same pull request may cancel the older run.

## Merge queue (30 minutes)

**Goal.** Everything a commit on `main` must have passed, on the exact merge result.

**Runs.**

- The full code gate from the pull-request lane, including Windows.
- macOS with Node 24 (`check-cross-os`), because that runner is scarce and belongs on the landing
  proof rather than every pull-request push.
- Self-scan: fail on findings outside `.evergreen-baseline.json`.
- Performance budget on the fixed fixture.
- Package smoke (npm tarball, Docker image, local Action) when the lane still lists it on
  `merge_group`.
- Site jobs (Lighthouse, Seaworthy, site budget, docs doctor) **when the queued change touches site
  files**; otherwise those jobs skip and `ci-ok` still passes.
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
| CodeQL | `codeql.yml` | Weekly |
| MCP listings | `mcp-listings.yml` | Weekly |
| Label sync | `labels.yml` | Weekly + path pushes |

These must not be required status checks. A red nightly run opens follow-up work; it does not block
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
publish per channel including npm via `publish.yml`, smoke). A version tag runs the full chain in
one workflow run so a failed stage is safe to re-run. A manual run with `dry_run` exercises every
stage and publishes nothing. Those tasks keep this lane's budget and the rule that `main` does not
carry the Action bundle.

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
| `docs-doctor.yml` | Pull request | `pull_request` on docs site paths | Slipway doctor on the documentation site (report-only until the site is clean) |
| `site-budget.yml` | Pull request | `pull_request` on site paths; `workflow_dispatch` | Fail when the docs site exceeds size or LCP budgets |
| `fuzz.yml` | Pull request / nightly | `pull_request` on parser paths; nightly schedule; `workflow_dispatch` | Deeper parser fuzz than the tight budget inside `npm run check` |
| `workflow-lint.yml` | Main | `push` to `main` on workflow paths; `workflow_dispatch` | actionlint + zizmor on workflow YAML and `action.yml` |
| `pages.yml` | Main | `push` to `main`; `workflow_dispatch` | Build the docs site, Seaworthy + Lighthouse, deploy to GitHub Pages |
| `labels.yml` | Main / nightly | `pull_request` / `push` on label paths; weekly schedule; `workflow_dispatch` | Sync `.github/labels.yml` and check good-first-issue briefs |
| `release.yml` | Main / release | `push` to `main`; version `v*` tags; `workflow_dispatch` | One release chain: Action bundle on `release/<tag>`, npm via `publish.yml`, binaries, provenance, channels, smoke |
| `package-smoke.yml` | Merge queue / nightly | `merge_group`; nightly schedule; `workflow_dispatch` | Prove npm tarball, Docker image, and local Action scan the same fixture |
| `ci-health.yml` | Nightly | `workflow_run` of CI on `main`; schedules; `workflow_dispatch` | Open/close devops issues on main failures, measure CI duration, quarantine flaky tests |
| `mutation.yml` | Nightly | Nightly schedule; `workflow_dispatch` | Mutation testing matrix (too slow for the merge gate) |
| `corpus.yml` | Pull request / main / nightly | `pull_request` / `push` on detector paths; weekly + twice-monthly schedules; `workflow_dispatch` with `mode` (`affected` / `full` / `record`) | Affected-ecosystem signal, full public corpus validate, and recorded full-run PR |
| `sources.yml` | Nightly | Weekly schedule; `workflow_dispatch` | Evidence URL reachability and rule freshness windows |
| `importers.yml` | Nightly | Weekly schedule; `workflow_dispatch` | Draft lifecycle rules from authoritative sources; open one PR per importer |
| `scorecard.yml` | Nightly | Weekly schedule; `branch_protection_rule`; `workflow_dispatch` | OpenSSF Scorecard publish + SARIF upload |
| `scorecard-floor.yml` | Nightly | Weekly schedule (after Scorecard); `workflow_dispatch` | Alert when the published Scorecard score is below the QUALITY.md floor |
| `codeql.yml` | Nightly | Weekly schedule; `workflow_dispatch` | CodeQL analysis of `main` |
| `mcp-listings.yml` | Nightly | Weekly schedule; `workflow_dispatch` | Compare tracked MCP directory listings to `server.json` |
| `publish.yml` | Release | `workflow_call` from `release.yml` | npm trusted publish with provenance, package smoke, MCP Registry |
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
- **Shared setup.** Checkout-independent Node install and cache move into one composite action in
  #2026; lanes above stay the same.
