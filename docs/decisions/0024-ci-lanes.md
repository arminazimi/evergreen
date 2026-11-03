# 0024 — CI lanes: pull request, merge queue, main, nightly, release

Status: proposed — maintainer acceptance is pending.

## Problem

The repository has many workflows with overlapping triggers. Pull requests, pushes to `main`,
the merge queue, scheduled jobs, and release publish each run a different mix of checks, and that
mix is only knowable by reading every YAML file. In recent history, many pushes to `main` cancelled
an earlier run before it finished, so commits landed without a complete verification. Follow-up
work in epic #1985 needs one written design before it can delete, merge, or rewire workflows.

## Decision

1. **Five lanes.** Every workflow belongs to one of: **pull request**, **merge queue**, **main**,
   **nightly** (scheduled and manual), or **release**. [CI.md](../CI.md) names what each lane runs,
   why, and its wall-clock time budget. A workflow that does not fit a lane is unused and is removed
   in a later task, not kept "just in case."
2. **One required check: `ci-ok`.** Branch protection and the merge queue require only the `ci-ok`
   job from `.github/workflows/ci.yml`. Individual jobs, corpus runs, Scorecard, fuzz, mutation, and
   package smoke stay out of the required list so the matrix can change without editing repository
   settings. `ci-ok` fails when any job it needs failed or was cancelled, and passes when every
   needed job succeeded or was skipped.
3. **The merge queue is the proof that lands on `main`.** A change reaches `main` only through the
   merge queue. The queue run is never cancelled by a newer push. It runs everything a commit on
   `main` must have passed: the full `npm run check` matrix that the lane requires, cross-OS where
   the design asks for it, self-scan, performance budget, and path-filtered site jobs when site
   files changed. Direct pushes to `main` are closed except for a documented release-bot exception,
   if one is still required after the release chain work.
4. **Pull requests are for feedback, not the landing proof.** A pull request runs a fast subset so
   authors see failures early. Docs-only changes skip the test matrix and run the docs path instead.
   Site jobs (Lighthouse, Seaworthy, docs doctor, site budget) run on a pull request only when site
   files change. The queue still re-runs what it needs; a green pull request does not replace the
   queue.
5. **`main` after the queue does not re-prove the same gate.** Once the queue is the only path,
   a push to `main` runs only post-merge side effects: badge publish, Pages deploy once per merge
   batch, and any release-branch build the release chain still triggers from `main`. It must not
   cancel a run that is the only verification for a commit. Until the queue is enforced, `main`
   keeps the full gate so history stays covered.
6. **Nightly and scheduled work stays off the merge path.** Mutation testing, fuzz (scheduled), the
   full public corpus, source freshness, importers, Scorecard, MCP listing checks, CI health, and
   the nightly package smoke belong here. They may open issues or fail loudly; they are never
   required to merge. Network-using corpus jobs stay non-required.
7. **Release is one chain with a time budget.** Verify, build, publish per channel, and smoke run as
   stages of one release path. A failed stage is safe to rerun. The Action bundle continues to live
   on `release/<tag>`, not on `main`. Details of splitting and joining workflows are later tasks;
   this record only fixes the lane and the budget.
8. **Time budgets are part of the design.** Each lane has a wall-clock budget in [CI.md](../CI.md).
   A job's `timeout-minutes` must fit its lane. Raising a lane budget, or moving work between lanes,
   updates CI.md in the same change.
9. **This record and CI.md change together.** Acceptance does not renumber this record. Status stays
   `proposed` until the maintainer accepts the design; after acceptance, later epic tasks may change
   workflows to match.

## Why

- **Decide before rewiring.** Deleting or merging workflows without a written target recreates the
  same sprawl under new names. The epic's later tasks need one document to implement against.
- **One name in branch protection.** Requiring `ci-ok` only keeps settings stable while jobs behind
  it change, which matches [MAINTAINERS.md](../../MAINTAINERS.md) and [CONTRIBUTING.md](../../CONTRIBUTING.md).
- **Queue as proof stops cancelled `main` holes.** When every commit is verified in the queue and
  that run is never cancelled, history does not depend on a race of pushes to `main`.
- **Expensive work off the critical path.** Mutation, full corpus, and Scorecard do not need to block
  every merge; putting them on nightly keeps the queue inside its budget.

## Consequences

- Follow-up tasks (#2024–#2032) implement this design: map and delete unused workflows, merge corpus
  workflows, extract shared setup, split and join the release chain, enforce the merge queue, stop
  cancelled verification on `main`, deploy Pages per batch, and path-filter site jobs.
- Until those tasks land, today's workflows may still over-run on `main` or under-filter on pull
  requests. The gap is expected; CI.md describes the target, and each task closes part of it.
- No runtime scan behavior, registry data, or public API changes. Scans stay offline. This record
  adds no runtime dependency.
