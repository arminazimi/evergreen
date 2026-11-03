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
`llms-full.txt` is buildable, generate it for the Jekyll site, and build the site instead.

**When site files change** (`docs/` site sources, theme config, Lighthouse config, and the paths
later tasks pin).

- Site budget, docs doctor, and related site checks.
- Do **not** run Lighthouse or Seaworthy on unrelated code-only pull requests (target; see #2032).

**Never required on the pull request itself.**

- Full public corpus, mutation testing, Scorecard, scheduled fuzz, importers, source freshness.
- Affected-ecosystem corpus ([`corpus-pr.yml`](../.github/workflows/corpus-pr.yml)) may run for
  signal; it stays **non-required** because it needs the network.

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
| Full public corpus | `corpus.yml` | Weekly |
| Record full corpus | `corpus-record.yml` | Twice monthly |
| Source freshness | `sources.yml` | Weekly |
| Lifecycle importers | `importers.yml` | Weekly |
| Scorecard + floor | `scorecard.yml`, `scorecard-floor.yml` | Weekly |
| CodeQL | `codeql.yml` | Weekly |
| MCP listings | `mcp-listings.yml` | Weekly |
| Label sync | `labels.yml` | Weekly + path pushes |

These must not be required status checks. A red nightly run opens follow-up work; it does not block
a green queue. Merging the three corpus workflows into one file is #2025; until then the table names
today's files.

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

**Out of scope for this design page.** Splitting `release.yml` into stages (#2027) and joining
`publish.yml` into that chain (#2028). Those tasks must keep this lane's budget and the rule that
`main` does not carry the Action bundle.

## What this design deliberately leaves out of the merge gate

- Network corpus validation.
- Mutation score (gated separately per [QUALITY.md](QUALITY.md) once measured).
- OpenSSF Scorecard floor (scheduled alert until the score meets the quality target).
- Marketplace-only publish steps.

## Changing this page

- **Accepted design.** After decision 0024 is accepted, workflow pull requests that move work
  between lanes or raise a budget update this page in the same change.
- **Inventory and deletions.** Mapping each of today's workflows to a lane and deleting unused ones
  is #2024; this page does not list every file on purpose so #2024 can own the inventory.
- **Shared setup.** Checkout-independent Node install and cache move into one composite action in
  #2026; lanes above stay the same.
