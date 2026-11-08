---
title: Reference quality
description: The measurable targets Evergreen holds its own code, data, and documentation to, the check that enforces each one, and the allowlist that carries existing debt to an end date.
---

# Reference quality

Evergreen is meant to be a reference implementation: evidence-backed findings, deterministic output, and a
local-first trust model. "Reference quality" only means something if a failing check can enforce it. This page
defines it as nine criteria. Each has a target, the check that enforces it, the current number, and the
an allowlist that is now empty.

This page describes **this repository**. It says nothing about the quality of repositories Evergreen scans,
and it adds no network access to any scan.

The criteria are recorded in [decision 0023](decisions/0023-measurable-quality-criteria.md), which is
**accepted**.

Measurement snapshot: **2026-11-08**, Node.js 22 or newer, TypeScript 5.9. Numbers are a snapshot; the command
beside each one is what to re-run.

## Rules

1. **Every criterion is enforced by a failing check.** The check runs in `npm run check`, the same gate CI runs,
   or in a named CI job that a pull request cannot merge without. "Measured but not enforced" is not allowed.
2. **Zero new debt.** A change may not add a file, function, or count that is worse than its target. There is
   no soft threshold for new code: it fails.
3. **There is no debt.** The allowlist, [`benchmarks/quality-allowlist.json`](../benchmarks/quality-allowlist.json),
   is empty in every section, and `npm run check:quality` fails on any entry. A change that cannot meet a target
   gets fixed code, never an allowlist entry, a higher ceiling, or a later date.
4. **Each criterion names its check.** Where a rule cannot be checked mechanically, this page says so and it stays
   a review rule.

Agents read this page before changing anything it covers. [AGENTS.md](../AGENTS.md#quality-bar) carries the short
version for every change.

## Targets at a glance

Before is `origin/main` measured by the same checker; after is this pull request. "Enforced by" names the check.

| # | Criterion | Target | Enforced by | Before (main) | After | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | File size | Median ≤300 lines; no file over 800 without an entry; none over 1,000 without an entry | `npm run check:quality` | median 89; 0 files over 800 | same; no allowlist entries | Enforced |
| 2 | Function size | No function over 50 lines without an entry | `npm run check:quality` | 35 functions over 50 (all allowlisted); max 122 | 0 over 50; max 50 | Enforced |
| 3 | Complexity | Cyclomatic complexity ≤15 per function; no function over 15 without an entry | `npm run check:quality` | 0 functions over 15; max 15 | same; no allowlist entries | Enforced |
| 4 | Type safety | Zero explicit `any` and zero `@ts-ignore` / `@ts-expect-error`; `as unknown as` and non-null assertions may not grow; `noImplicitOverride`, `noUnusedLocals`, `noUnusedParameters` on | `npm run check:quality`, `npm run build` | 0 `any`, 0 `@ts-ignore`, 0 `as unknown as`, 0 non-null | same; three flags on | Enforced |
| 5 | Boundaries | Import and trust rules in [AGENTS.md](../AGENTS.md#architecture-boundaries) hold; see the list below | `npm run check:quality` | 0 violations | same; no allowlist entries | Partly enforced |
| 6 | Coverage | Lines ≥93, branches ≥87, functions ≥93; no total falls below main | CI floors on pull requests and pushes; baseline check against main | 94.75 / 87.04 / 94.60 (2026-11-01) | 94.69 / 87.10 / 94.65 (2026-11-02) | Enforced on pull requests |
| 7 | Mutation score | Each file's score may not fall; overall break at 60, high at 80, on the mutated core | nightly `mutation.yml` report job (not in `npm run check`); `ci.yml` guards the baseline on pull requests | 59.68% overall (2026-11-04, before reporters) | 82.42% overall (2026-11-07); break at 60 | Enforced nightly |
| 8 | Docs | Generated indexes, pages, LLM index, data API, and site build agree; links and accessibility clean | `npm run check`, the `check:*` steps in `ci.yml` | generated checks pass; site links report-only | generated checks now all gate CI; links report-only | Partly enforced |
| 9 | Security | No high or critical advisory; no moderate or low advisory without an allowlist entry; runtime audit clean; Scorecard ≥6.0 | `npm audit` steps in `ci.yml`; `scorecard-floor.yml` (weekly) | `audit` allowlist section empty; Scorecard 4.8 | same | Enforced; Scorecard alert fails until ≥6.0 |
| 10 | Remaining debt | The allowlist is empty and the checker rejects any entry | `npm run check:quality` (`--report` prints the totals) | 35 functions over 50 | 0 in every section | Enforced |

## 1. File size

**Target.** The median hand-written file is **300 lines or fewer**. A file over **800 lines** fails unless it has
a file over **1,000 lines** fails too. Hand-written means `src/**/*.ts`
minus `src/usage/vendor/` and generated `*.generated.ts` files. Line counts are `wc -l`.

**Enforced by.** `npm run check:quality` (`tools/check-quality.ts`), which runs inside `npm run check`.

**Current.** 491 hand-written files, median 89 lines, 71 over 300, none over 800 (the largest is 738). The allowlist has no file-size entry.

**Why these numbers.** Google's code-review guidance calls 100 lines a reasonable change and 1,000 lines usually
too large; that guidance is about the size of a change, not one file. ESLint's `max-lines` rule defaults to 300.
The median target uses that default; 800 is the warning line and 1,000 the ceiling.

## 2. Function size

**Target.** A function is **50 lines or fewer**, counted from the line it starts on through its closing brace,
inclusive. A function over 50 lines fails.

**Enforced by.** `npm run check:quality`, with the TypeScript compiler API, in the same pass that measures file size
and complexity.

**Current.** 5,432 functions, none over 50 lines; the longest is exactly 50. The last 35 were split in #2283 without a change in behavior.

**Why this number.** ESLint's `max-lines-per-function` rule defaults to 50. A function that needs more than that
usually does several jobs; splitting it keeps each one testable on its own.

## 3. Complexity

**Target.** Cyclomatic complexity per function is **15 or less**. Complexity counts one plus each `if`, loop,
`case`, `catch`, `?:`, `&&`, `||`, and `??`. Nested functions are measured on their own. A function over 15 fails.

**Enforced by.** `npm run check:quality`, with the TypeScript compiler API. No linter is added; the parser is the
one already in `devDependencies`.

**Current.** No function is over 15; the highest is 15. The allowlist has no complexity entry.

**Why these numbers.** ESLint's `complexity` rule defaults to 20. The target is stricter, at 15, with 20 kept as the
number a reviewer may point to in the follow-up.

## 4. Type safety

**Target.**

- Zero explicit `any` and zero `@ts-ignore` / `@ts-expect-error` in hand-written `src/`. These fail with no
  allowlist: a new one is never acceptable.
- `as unknown as` is not allowed. No file has one and none may be added.
- Non-null assertions (`x!`) are not allowed. No file has one and none may be added.
- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noUnusedLocals`, and
  `noUnusedParameters` are on in [tsconfig.json](../tsconfig.json).

**Enforced by.** `npm run build` (the compiler, with every flag above) and `npm run check:quality` for the counts.

**Current.** 0 explicit `any`, 0 `@ts-ignore`, 0 `as unknown as`, 0 non-null assertions. The three unused and override flags are on.

**Why these flags.** The `sindresorhus/tsconfig` strictest preset sets `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noImplicitOverride`, and the unused checks. Evergreen had the first two already.
`skipLibCheck` stays on: it skips type checking inside dependencies, not Evergreen's own code.

## 5. Boundaries

**Target.** These rules hold. A violation fails `npm run check:quality`.

| Rule | Statement | Enforced by |
| --- | --- | --- |
| `engine-no-detectors` | `src/engine/` and `src/domain.ts` do not import `src/detectors/**`. | mechanical |
| `no-network` | `src/detectors/**`, `src/engine/`, and `src/domain.ts` import none of `node:net`, `node:http`, `node:https`, `node:dgram`, `node:tls`, `node:child_process` (or the bare names), and call no `fetch(`. | mechanical, direct imports and calls only |
| `registry-json-only` | `registry/**` holds JSON files only. | mechanical |
| `adapters-no-detectors` | `src/cli.ts`, `src/mcp.ts`, and `src/github-action.ts` do not import `src/detectors/**`. | mechanical; the rule "owns no detector logic" is review |
| Source usage holds no detector rules | `src/source-usage.ts` holds traversal and matching only. | **review** |
| Scans stay offline | no path reads the network, including through a helper module. | mechanical for direct imports; transitive reach is **review** |

The rules come from [Architecture](ARCHITECTURE.md#trust-boundaries) and [AGENTS.md](../AGENTS.md#architecture-boundaries).

**Current.** No boundary violations. The `boundaries` allowlist section is empty.

**Not mechanically checkable today.** Rule 4 (what `src/source-usage.ts` owns) and the "owns logic" half of the
adapter rule are review rules. Transitive network reach needs a module-graph walk, which is a dependency-cruiser
or architecture-test follow-up; no such dependency is added here.

## 6. Coverage

**Target.** `npm run test:coverage` meets the floors in `package.json` (`coverageFloors`): **93% lines, 87%
branches, 93% functions**. A pull request also may not:

- lower a changed source file's line coverage by more than **1 percentage point** (`coverage-diff`, existing);
- lower any overall total below **main's report**, beyond run-to-run noise (**0.05** points, `coverage-thresholds --baseline`). A real drop in one file is caught by the per-file check (1 point).

A file whose only change is the formatter's output is skipped: formatting the base revision with the current
`biome.json` reproduces the file, and re-wrapped lines move V8's line counters without changing what the tests
exercise. When every changed `src/` file is formatting-only, both comparisons are skipped and the absolute floors
still apply.

**Enforced by.** `ci.yml`, on the Linux Node 24 job that runs the suite once with coverage
(`EVERGREEN_CHECK_COVERAGE=1`):

- *Enforce coverage floors* runs on **every** event, pull requests included, and reads the lcov the same run wrote.
  Before this change it ran on pushes to `main` only.
- *Coverage diff for changed src files* runs on pull requests that change `src/`. It now also runs the baseline
  check against the main artifact. The check is skipped when no successful main run has an artifact yet.

No second test run is added.

**Current.** 94.69% lines, 87.10% branches, 94.65% functions (2026-11-02, one local run of
`EVERGREEN_CHECK_COVERAGE=1 npm run check`). The branch floor has about 0.10 points of headroom, so a branch-heavy
change without tests fails the floor.

## 7. Mutation score

**Target.** On the mutated core (`src/engine/`, `src/baseline.ts`, `src/diff.ts`, `src/vers/**/*.ts`) and the reporters
(`src/reporters.ts`, `src/reporters/**/*.ts`), each
file's score may not fall below the value in
[`benchmarks/mutation-baseline.json`](../benchmarks/mutation-baseline.json), and the overall score stays at **60% or
more** (`break`), with **80%** the high-water mark. Every reporter file's baseline is at least 80%, and
`tests/mutation-baseline.test.ts` fails if one is missing or lower.

**Enforced by.** The `report` job in `mutation.yml` merges the shard reports and runs `tools/mutation-baseline.js`
(`npm run check:mutation`). A file whose score fell below its baseline fails the job with the file and the
difference. A new file without a baseline entry must meet the 60% target, and a baseline entry whose file produces
no mutants is stale and fails until it is removed. Pull requests cannot lower the ratchet: `ci.yml` runs the tool
with `--against origin/main` and fails when a score falls or a live file's entry is removed. A maintainer records an
improvement with `node dist/tools/mutation-baseline.js --update` from a complete report; it refuses to lower a
score. The overall `thresholds.break` is 60. A shard covers only one slice of the scope, so the nightly shard jobs
run with `stryker.shard.config.mjs`, which disables the break, and the `report` job applies the break to the merged
report with `--break`. A full mutation run is not part of `npm run check`.

**Current.** Measured 2026-11-07 from a complete `workflow_dispatch` run on `main` (`b01aea5b`): overall **82.42%**
(2649 killed or timed out, 565 survived or uncovered, 25 files). Per file, lowest first: `reporters/json.ts` 37.50%,
`reporters/registry.ts` 48.10%, `diff.ts` 48.70%, `vers/semver.ts` 68.57%, `baseline.ts` 72.13%,
`vers/gem.ts` 72.41%, `engine/discover.ts` 77.64%, `vers/nuget.ts` 82.73%, `engine/detect.ts` 82.81%,
`vers/maven.ts` 83.51%, `engine/index.ts` 84.54%, `reporters/html.ts` 87.03%, `vers/pep440.ts` 87.37%,
`reporters/markdown.ts` 91.25%, `reporters/text.ts` 95.72%. The reporters were re-measured after #2551 split the
reporter contract. The per-file ratchet currently fails on `reporters/json.ts`, `reporters/registry.ts`,
`reporters/html.ts`, `reporters/markdown.ts`, `reporters/text.ts`, `diff.ts`, `baseline.ts`, and `vers/nuget.ts`;
that is existing debt from #2551 (reporters) and the test-quality epic (#1992) (diff, baseline, nuget), not a
break-threshold failure. The overall score is above the break, so the break check itself passes.

**When the break was set.** #2282 ran a complete mutation job on 2026-11-07 and set `thresholds.break` to 60 from a
measured **82.42%** overall. The 2026-11-04 score of 59.68% was below 60 because the mutation scope did not include
the reporters yet, not because the target changed.

**Why these numbers.** They are Stryker's own defaults for `high` and `low`. Google's testing blog defines the
mutation score as the ratio of mutants the tests detect.

## 8. Docs

**Target.**

- The generated command registry is current, and every command module appears in the CLI help.
- `docs/llms-full.txt` is buildable from the pages linked from `docs/llms.txt` (generated at site build; not committed).
- `docs/sitemap.xml` and `docs/rules/index.md` are generated at site build (not committed).
- `docs/dashboard/data.json` is buildable from the corpus thresholds (generated at site build; not committed).
- Committed reference pages, answer pages, and Open Graph images match `registry/*.json`. The data API is buildable and schema-valid from `registry/*.json` (generated at site build; not committed).
- The README coverage table names files each detector reads and commands that exist.
- The documentation site builds with **zero broken internal links** and no accessibility errors at the level
  Seaworthy checks.

**Enforced by.**

- `npm run check`: the command registry (`generate-commands-index.mjs --check`) and the docs tests.
- `ci.yml`, Linux Node 24: `check:reference`, `check:og-images`, `check:answer-pages`, `check:llms`,
  `check:data-api`, and `check:dashboard`. Reference, Open Graph, and answer checks fail on drift from
  their source; `check:llms`, `check:data-api`, and `check:dashboard` fail when the sources would not
  produce a well-formed build-time file.
- Links and accessibility: **report-only**. `ci.yml` runs Seaworthy with `--fail-on none`, and `docs-doctor.yml`
  sets `level: none`. This change does not turn them into gates, because it did not run the Seaworthy findings to
  a clean state locally. The condition is in the next paragraph.

**Condition to make links and accessibility gate.** A local run of the site build and Seaworthy with zero
findings, or with each finding named in an allowlist with an owner and expiry. Then `--fail-on none` becomes
`--fail-on error` and `docs-doctor.yml` raises its level, in one pull request.

**Not done.** A test that every CLI command and flag appears in a documentation page. The existing docs tests check
selected pages only. This is a follow-up issue, not a gate.

**Why this shape.** Google's documentation guide asks for documentation in the same change as the code. Diátaxis
separates tutorials, how-to guides, reference, and explanation. OpenSSF Best Practices requires basic and
reference documentation of the external interface.

## 9. Security

**Target.**

- **Runtime dependencies:** zero known advisories (`npm audit --omit=dev`), at any severity.
- **Whole lockfile:** zero **high or critical** advisories, ever. The `audit` allowlist section is empty.
- **Scorecard:** overall **6.0 or more** by v0.8.0 and **7.0** by v1.0, with every check at least 5 except the
  exceptions already explained in [SECURITY.md](../SECURITY.md#openssf-scorecard).
- **Static analysis:** no open high or critical CodeQL alerts.
- **Workflows:** third-party actions pinned to a full commit SHA; `actionlint` and `zizmor` pass on workflow changes.

**Enforced by.**

- `ci.yml`, *Audit dependencies*, on the Linux Node 24 job. It runs `npm audit --omit=dev --audit-level=low`, which
  fails on any runtime advisory. It then runs `npm audit --json` and passes the result to
  `npm run check:quality --audit`, which fails on any high or critical advisory and on any medium or low advisory
  not allowlisted by id. An allowlisted advisory that is no longer reported is stale and fails.
- `scorecard-floor.yml`, weekly, schedule and dispatch only. It reads the public Scorecard score and fails below
  **6.0**. Scorecard is scored outside this repository, so it cannot gate a pull request; the failed run is the alert.
  **It fails now**: the published score is 4.8. It passes once the score reaches 6.0.
- CodeQL and Scorecard (`scorecard.yml`) run weekly and publish to code scanning. `workflow-lint.yml` runs
  actionlint and zizmor on pushes to `main`.

**Current.**

- Runtime audit: **0**.
- Root lockfile, from the open Dependabot alerts (npm's audit endpoint was unreachable from the sandbox that wrote
  this change, so these are the same advisories from GitHub's database): **5 medium** (`fast-uri` ×2, `qs` ×2,
  `minimatch`) and **2 low** (`fast-uri` ×2). No high or critical. All are development dependencies.
- The Dependabot alerts in `examples/` and `extensions/vscode/` include high-severity advisories. They are outside
  the root `npm audit` scope, so this check does not see them. They are a follow-up for the owners of those trees.
- Scorecard: **4.8** (published 2026-10-31).

**Not done.** Raising the Scorecard score; the checks behind 4.8 (Pinned-Dependencies in `release.yml` and the
container images, Signed-Releases, Dangerous-Workflow in `release.yml`, Code-Review, CII-Best-Practices) need their
own changes. `workflow-lint.yml` still runs on pushes only.

## Allowlist

[`benchmarks/quality-allowlist.json`](../benchmarks/quality-allowlist.json) is **empty in every section**
(`fileSize`, `functionLength`, `complexity`, `asUnknownAs`, `nonNull`, `boundaries`, `audit`). `npm run check:quality`
reports each entry it finds as a failure, so no debt can be added again, and the comparison with the base ref in
`ci.yml` still rejects a new entry or a raised ceiling. The schema is `evergreen.quality-allowlist.v2`.

## Remaining debt

There is none. `npm run check:quality -- --report` prints one line per section (files over 800 lines, functions over
50 lines, functions over 15, `as unknown as`, non-null assertions, boundary violations, advisories), and every line
reads 0. It reads only the repository and the allowlist, with no network access.

## Monthly report

Each target above appears in the monthly progress report with its current value and the change against the previous
month. `npm run metrics:quality` writes `metrics/quality/<YYYY-MM-DD>.json` from the allowlist and any local
`lcov.info`, `artifacts/mutation-report.json`, and Scorecard row already stored under `metrics/adoption/` — no
network access. `npm run report:monthly -- --out docs/reports/monthly-YYYY-MM.md` reads the newest snapshot of the
month and the newest of the previous month, and prints a dash when either side is missing rather than treating a gap
as zero. Published reports live under [`docs/reports/`](reports/).

## Follow-up work

The code-debt items are done: the allowlist is empty. What remains needs its own owner issue.

1. Add a dependency-cruiser configuration or an architecture test for the transitive network rule and rules 4 and 5.
2. Triage the high advisories in `examples/` and `extensions/vscode/`.
3. Add a docs test that every CLI command and flag is documented.
4. Clean the Seaworthy and docs-doctor findings, then make them gate (see the condition in [Docs](#8-docs)).
5. ~~Set `thresholds.break` when the first complete mutation score exists~~ Done: break at 60 since 2026-11-07 (#2282).
6. Raise the Scorecard score to 6.0 (see [Security](#9-security)).

## Peer comparison

Each target is compared with a published practice or tool default. The links are the sources.

| Criterion | Peer practice | Evergreen target | Source |
| --- | --- | --- | --- |
| File size | 100 lines is a reasonable change; 1,000 lines is usually too large. ESLint's `max-lines` default is 300 per file. | Median 300, ceiling 1,000, warning at 800 | [Google eng-practices: small CLs](https://google.github.io/eng-practices/review/developer/small-cls.html), [ESLint `max-lines`](https://eslint.org/docs/latest/rules/max-lines) |
| Function size | ESLint's `max-lines-per-function` rule defaults to 50. | 50 per function | [ESLint `max-lines-per-function`](https://eslint.org/docs/latest/rules/max-lines-per-function) |
| Complexity | ESLint's `complexity` rule defaults to 20 per function. | 15 per function, 20 as the reviewer's ceiling | [ESLint `complexity`](https://eslint.org/docs/latest/rules/complexity) |
| Type safety | The strictest `sindresorhus/tsconfig` preset sets `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, and the unused checks. | All of those, plus zero `any` and zero `@ts-ignore` | [`sindresorhus/tsconfig`](https://github.com/sindresorhus/tsconfig) |
| Boundaries | Kubernetes enforces package import rules with `import-boss` and `.import-restrictions` files. | Rules above, checked by the compiler API | [`k8s.io/gengo/examples/import-boss`](https://pkg.go.dev/k8s.io/gengo/examples/import-boss) |
| Coverage | OpenSSF Best Practices asks for 80% statement coverage at silver and 80% branch coverage at gold. | 93% lines, 87% branches, 93% functions | [OpenSSF Best Practices criteria](https://www.bestpractices.dev/criteria) |
| Mutation score | Stryker defaults to `high: 80`, `low: 60`, `break: null`. | Break at 60, high at 80 | [Stryker configuration](https://stryker-mutator.io/docs/stryker-js/configuration/), [Google Testing Blog: mutation testing](https://testing.googleblog.com/2021/04/mutation-testing.html) |
| Docs | Change documentation in the same change as the code; divide docs into tutorials, how-to, reference, and explanation. | Generated pages current, site links and accessibility clean | [Google documentation best practices](https://google.github.io/styleguide/docguide/best_practices.html), [Diátaxis](https://diataxis.fr/), [OpenSSF criteria](https://www.bestpractices.dev/criteria) |
| Security | OpenSSF Scorecard scores 18 repository checks from 0 to 10, including Code-Review, Pinned-Dependencies, Vulnerabilities, and Dangerous-Workflow. | Scorecard ≥6.0 at v0.8.0, ≥7.0 at v1.0; high and critical advisories never allowed | [Scorecard checks](https://github.com/ossf/scorecard/blob/main/docs/checks.md) |

## What this page does not claim

- A number is a snapshot. Re-run the command to check today.
- Changing a target is a decision, not a documentation edit: update this page and
  [decision 0023](decisions/0023-measurable-quality-criteria.md) together.
- Maintainer acceptance of decision 0023 is pending. Until it is accepted, these targets are a proposal under
  review, not a standard contributors can be held to.
