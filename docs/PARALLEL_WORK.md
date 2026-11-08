---
title: Parallel work experiment
description: Twenty real tasks replayed from one base, with exact counts of textual and semantic conflicts and the cause of each.
---

# Parallel work experiment

[AGENTS.md](../AGENTS.md#parallel-task-protocol) says how several agents work on the repository at once: one branch per task from the same base, per-item files, changelog fragments. This page records whether that structure holds up, with exact counts.

## Method

- **Tasks.** The 20 newest non-merge commits on `main` at `4f96a47e` (`4f96a47e` back to `f42e97d9`; history is linear). They are real, independent-looking tasks of different kinds: 3 detector promotions, 3 corpus and data updates, 3 agent edit hooks, 3 benchmark comparisons, 4 CI and release changes, 2 fixes, 1 refactor, and 1 docs change.
- **Base.** The parent of the oldest task, `e191dd8d`.
- **Branches.** Each task became its own branch from the base by cherry-picking its commit. A cherry-pick that stops with a conflict means the task changed lines another task in the window also changed.
- **Merge order.** The branches that applied cleanly were merged into the base in three seeded random orders, which is what a queue does when it merges in arrival order.
- **Semantic check.** `npm run build` on the merged result, then the test suite.

## Result

| Measure | Count |
|---|---|
| Tasks | 20 |
| Branches that apply to the base with no textual conflict | 12 |
| Tasks with a textual conflict against another task in the set | 8 |
| Textual conflicts when merging the 12 clean branches (3 random orders) | 0 |
| Distinct trees across those 3 orders | 1 (identical) |
| Semantic conflicts among the 12 clean branches | 1 |

The target is zero textual conflicts. It is **not met**: 8 of 20 tasks conflict. The structure works where a task adds per-item files (a changelog fragment, a corpus file, a new test, a new workflow): none of those conflicted.

## Textual conflicts, by cause

| Cause | Tasks that conflicted | Shared paths |
|---|---|---|
| Hard-coded counts and prose that every corpus or promotion task rewrites | dart and android promotion, rust corpus, node corpus, source-freshness review, deno and bun promotion (5) | `docs/state-of-eol.md`, `tests/dashboard-data.test.ts`, `tests/corpus-thresholds.test.ts`, `README.md`, `docs/validation/corpus.md`, `docs/COMPATIBILITY.md`, `docs/VALIDATION.md`, `examples/capabilities.json` |
| Agent edit hooks registered by editing shared lists, and sibling hook tests that list every hook | Copilot hook, Cline hook (2; both against the Gemini hook, and Cline also against Copilot) | `src/agent-hooks/index.ts`, `src/commands/init.ts`, `src/init-agents.ts`, `tests/fixtures/cli/help.txt`, `docs/HOOKS.md`, `docs/BENCHMARKS.md`, each sibling `tests/agent-hooks-*.test.ts` |
| Shared benchmark docs and one shared `biome.json` list | Dependabot comparison, against the Renovate comparison (1) | `benchmarks/comparison/README.md`, `biome.json` |

Three causes, 8 conflicting tasks. `examples/capabilities.json` is an assembled file, so the deno and bun promotion edited a file that [AGENTS.md](../AGENTS.md#shared-paths) says is regenerated, not edited.

## Semantic conflicts

- `reproduce.ts` from the comparison-reproduce task imports `./dependabot/*.js`, which the Dependabot comparison task adds. Merged without it, `npm run build` fails with TS2307. The two tasks are not independent, and no textual conflict reports it.
- Without that task, the other 11 branches build cleanly. Of the failures in the full test run on that merge, two are `npm pack` failures from the experiment environment (Node.js 26) and one is a stale compiled test from an earlier build in the same checkout. The run did not rule out the remaining failures against the base, so they are not counted.

## What this does not show

- The tasks are replayed from history, not started fresh from one base, so some conflicts are really dependencies (the later task was written on top of the earlier one). The causes above are the shared paths either way.
- The merge queue is not on (#2029 is open), so the merges were local `git merge` runs, not queue runs.
- Rerun this experiment after each cause is fixed. The goal stays zero textual conflicts.

## After the fix for hard-coded counts (#2581)

The first cause above is addressed by deriving the counts instead of typing them:

- `tests/dashboard-data.test.ts` recomputes each detector's evidence from the per-repository files; `tests/corpus-thresholds.test.ts` takes the detector list from `benchmarks/thresholds/` and the enforcement flag from the level.
- `docs/state-of-eol.md` holds a placeholder; the Pages workflow builds the tables (`coverage-matrix.js --site`).
- Corpus passes are one file each in `docs/validation/passes/`, not sections appended to `docs/validation/corpus.md`.
- `examples/capabilities.json` lists each ecosystem over several lines, so promoting two neighbouring ecosystems edits lines that are not adjacent.

Not fixed: the generated README and `docs/COMPATIBILITY.md` coverage tables (and the accuracy table in `docs/VALIDATION.md`) have one line per ecosystem and must stay committed so they render on GitHub and npm. Promoting two ecosystems whose rows sit next to each other still conflicts on those rows. Rerun the experiment to measure the rest.
