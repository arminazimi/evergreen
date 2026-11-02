---
title: Reference quality
description: The measurable targets Evergreen holds its own code, data, and documentation to, the check that enforces each one, and the allowlist that carries existing debt to an end date.
---

# Reference quality

Evergreen is meant to be a reference implementation: evidence-backed findings, deterministic output, and a
local-first trust model. "Reference quality" only means something if a failing check can enforce it. This page
defines it as eight criteria. Each has a target, the check that enforces it, the current number, and the
allowlist entries that hold existing debt.

This page describes **this repository**. It says nothing about the quality of repositories Evergreen scans,
and it adds no network access to any scan.

The proposal is recorded in [decision 0023](decisions/0023-measurable-quality-criteria.md). That record is
**proposed**: these targets and rules become the standard when the maintainer accepts them.

Measurement snapshot: **2026-11-02**, Node.js 22 or newer, TypeScript 5.9. Numbers are a snapshot; the command
beside each one is what to re-run.

## Rules

1. **Every criterion is enforced by a failing check.** The check runs in `npm run check`, the same gate CI runs,
   or in a named CI job that a pull request cannot merge without. "Measured but not enforced" is not allowed.
2. **Zero new debt.** A change may not add a file, function, or count that is worse than its target. There is
   no soft threshold for new code: it fails.
3. **Existing debt lives only in the allowlist**, [`benchmarks/quality-allowlist.json`](../benchmarks/quality-allowlist.json).
   Each entry names one file, function, or advisory, carries its current value as a **ceiling**, a reason, an
   owner issue (`#<number>`), and an `expires` date. The date is **2027-01-26**, the end of the v0.8.0 phase in
   [ROADMAP.md](ROADMAP.md); no entry may run past it, and the check fails once an entry passes it.
   - An entry may shrink. Then its number is set to the new value in the same change.
   - An entry may be removed, and a stale one (no longer matching a violation) fails until it is removed.
   - An entry may **never** be added, raised, or loosened to make a change pass. Fix the code.
4. **Each criterion names its check.** Where a rule cannot be checked mechanically, this page says so and it stays
   a review rule.

Agents read this page before changing anything it covers. [AGENTS.md](../AGENTS.md#quality-bar) carries the short
version for every change.

## Targets at a glance

Before is `origin/main` measured by the same checker; after is this pull request. "Enforced by" names the check.

| # | Criterion | Target | Enforced by | Before (main) | After | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | File size | Median ≤300 lines; no file over 800 without an entry; none over 1,000 without an entry | `npm run check:quality` | median 90; 2 files over 800; 1 over 1,000 | same; both files allowlisted | Enforced |
| 2 | Complexity | Cyclomatic complexity ≤15 per function; no function over 15 without an entry | `npm run check:quality` | 191 functions over 15; 106 over 20; max 131 | 191 over 15 (all allowlisted); 105 over 20; max 131 | Enforced with debt |
| 3 | Type safety | Zero explicit `any` and zero `@ts-ignore` / `@ts-expect-error`; `as unknown as` and non-null assertions may not grow; `noImplicitOverride`, `noUnusedLocals`, `noUnusedParameters` on | `npm run check:quality`, `npm run build` | 0 `any`, 0 `@ts-ignore`, 9 `as unknown as`, 589 non-null | same counts, all allowlisted; three flags on | Enforced |
| 4 | Boundaries | Import and trust rules in [AGENTS.md](../AGENTS.md#architecture-boundaries) hold; see the list below | `npm run check:quality` | 1 violation (adapter imports a detector) | allowlisted (1) | Partly enforced |
| 5 | Coverage | Lines ≥93, branches ≥87, functions ≥93; no total falls below main | CI floors on pull requests and pushes; baseline check against main | 94.75 / 87.04 / 94.60 (2026-11-01) | 94.69 / 87.10 / 94.65 (2026-11-02) | Enforced on pull requests |
| 6 | Mutation score | Break at 60, high at 80, on the mutated core | nightly `mutation.yml` (not in `npm run check`) | not measured since `break` is `null` | unchanged | Not gated yet; condition below |
| 7 | Docs | Generated indexes, pages, LLM index, data API, and site build agree; links and accessibility clean | `npm run check`, the `check:*` steps in `ci.yml` | generated checks pass; site links report-only | generated checks now all gate CI; links report-only | Partly enforced |
| 8 | Security | No high or critical advisory; no moderate or low advisory without an allowlist entry; runtime audit clean; Scorecard ≥6.0 | `npm audit` steps in `ci.yml`; `scorecard-floor.yml` (weekly) | runtime 0; root lockfile 5 medium, 2 low; Scorecard 4.8 | same advisories, allowlisted by id; floor alert added | Enforced; Scorecard alert fails until ≥6.0 |

## 1. File size

**Target.** The median hand-written file is **300 lines or fewer**. A file over **800 lines** fails unless it has
an allowlist entry, and a file over **1,000 lines** fails unless it has one too. Hand-written means `src/**/*.ts`
minus `src/usage/vendor/` and generated `*.generated.ts` files. Line counts are `wc -l`.

**Enforced by.** `npm run check:quality` (`tools/check-quality.ts`), which runs inside `npm run check`.

**Current.** 359 hand-written files, median 90 lines, 50 over 300, two over 800. Both are allowlisted at their
current size: `src/source-usage.ts` (1,983 lines, over the 1,000 ceiling) and `src/reporters.ts` (911 lines).

**Why these numbers.** Google's code-review guidance calls 100 lines a reasonable change and 1,000 lines usually
too large; that guidance is about the size of a change, not one file. ESLint's `max-lines` rule defaults to 300.
The median target uses that default; 800 is the warning line and 1,000 the ceiling.

## 2. Complexity

**Target.** Cyclomatic complexity per function is **15 or less**. Complexity counts one plus each `if`, loop,
`case`, `catch`, `?:`, `&&`, `||`, and `??`. Nested functions are measured on their own. A function over 15 fails
unless it has an allowlist entry at its current value.

**Enforced by.** `npm run check:quality`, with the TypeScript compiler API. No linter is added; the parser is the
one already in `devDependencies`.

**Current.** 3,774 functions. **191** are over 15 and all are allowlisted at their value; **105** are over 20;
the largest is 131. The count over 15 is unchanged from main. One function, `scanRepository` in `src/engine.ts`,
went from 21 to 20 because an unused `&&` in a removed declaration no longer counts.

**Why these numbers.** ESLint's `complexity` rule defaults to 20. The target is stricter, at 15, with 20 kept as the
number a reviewer may point to in the follow-up.

## 3. Type safety

**Target.**

- Zero explicit `any` and zero `@ts-ignore` / `@ts-expect-error` in hand-written `src/`. These fail with no
  allowlist: a new one is never acceptable.
- `as unknown as` may not grow. Each file that has one is allowlisted at its count.
- Non-null assertions (`x!`) may not grow. The allowlist holds one ceiling for all of `src/`.
- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noUnusedLocals`, and
  `noUnusedParameters` are on in [tsconfig.json](../tsconfig.json).

**Enforced by.** `npm run build` (the compiler, with every flag above) and `npm run check:quality` for the counts.

**Current.** 0 explicit `any`, 0 `@ts-ignore`, **9** `as unknown as` in 6 files, **589** non-null assertions. The
three unused and override flags were off before this change; enabling them fixed 38 mechanical errors (unused
imports, locals, and parameters), with no behavior change.

**Why these flags.** The `sindresorhus/tsconfig` strictest preset sets `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noImplicitOverride`, and the unused checks. Evergreen had the first two already.
`skipLibCheck` stays on: it skips type checking inside dependencies, not Evergreen's own code.

## 4. Boundaries

**Target.** These rules hold. A violation fails `npm run check:quality` unless it has an allowlist entry at its
count.

| Rule | Statement | Enforced by |
| --- | --- | --- |
| `engine-no-detectors` | `src/engine.ts` and `src/domain.ts` do not import `src/detectors/**`. | mechanical |
| `no-network` | `src/detectors/**`, `src/engine.ts`, and `src/domain.ts` import none of `node:net`, `node:http`, `node:https`, `node:dgram`, `node:tls`, `node:child_process` (or the bare names), and call no `fetch(`. | mechanical, direct imports and calls only |
| `registry-json-only` | `registry/**` holds JSON files only. | mechanical |
| `adapters-no-detectors` | `src/cli.ts`, `src/mcp.ts`, and `src/github-action.ts` do not import `src/detectors/**`. | mechanical; the rule "owns no detector logic" is review |
| Source usage holds no detector rules | `src/source-usage.ts` holds traversal and matching only. | **review** |
| Scans stay offline | no path reads the network, including through a helper module. | mechanical for direct imports; transitive reach is **review** |

The rules come from [Architecture](ARCHITECTURE.md#trust-boundaries) and [AGENTS.md](../AGENTS.md#architecture-boundaries).

**Current.** One violation: `src/github-action.ts` imports a detector (`adapters-no-detectors`). It is allowlisted
at 1 with an owner and expiry.

**Not mechanically checkable today.** Rule 4 (what `src/source-usage.ts` owns) and the "owns logic" half of the
adapter rule are review rules. Transitive network reach needs a module-graph walk, which is a dependency-cruiser
or architecture-test follow-up; no such dependency is added here.

## 5. Coverage

**Target.** `npm run test:coverage` meets the floors in `package.json` (`coverageFloors`): **93% lines, 87%
branches, 93% functions**. A pull request also may not:

- lower a changed source file's line coverage by more than **1 percentage point** (`coverage-diff`, existing);
- lower any overall total below **main's report**, beyond run-to-run noise (**0.05** points, `coverage-thresholds --baseline`). A real drop in one file is caught by the per-file check (1 point).

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

## 6. Mutation score

**Target.** On the mutated core (`src/engine.ts`, `src/baseline.ts`, `src/diff.ts`, `src/vers/**/*.ts`), the score
stays at **60% or more** (`break`), with **80%** the high-water mark.

**Enforced by.** Nothing yet. `npm run test:mutation` (Stryker) runs nightly in `mutation.yml` and publishes the
score; a full run is not part of `npm run check`. `thresholds.break` stays `null` in this change because no
complete measured score exists in the repository.

**Condition to enforce it.** The first complete nightly run that writes a score to
`artifacts/mutation-report.json` sets `thresholds.break` to 60 in its own pull request, records the score and date
in this section, and lands within the v0.8.0 phase (before 2027-01-26). Until then, this criterion is reviewed,
not gated.

**Why these numbers.** They are Stryker's own defaults for `high` and `low`. Google's testing blog defines the
mutation score as the ratio of mutants the tests detect.

## 7. Docs

**Target.**

- The generated command registry is current, and every command module appears in the CLI help.
- `docs/llms-full.txt` matches the pages linked from `docs/llms.txt`.
- Reference pages, answer pages, Open Graph images, and the data API match `registry/*.json`.
- The README coverage table names files each detector reads and commands that exist.
- The documentation site builds with **zero broken internal links** and no accessibility errors at the level
  Seaworthy checks.

**Enforced by.**

- `npm run check`: the command registry (`generate-commands-index.mjs --check`) and the docs tests.
- `ci.yml`, Linux Node 24: `check:reference`, `check:og-images`, `check:answer-pages`, and, added here,
  `check:llms` and `check:data-api`. Each fails on drift from its source.
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

## 8. Security

**Target.**

- **Runtime dependencies:** zero known advisories (`npm audit --omit=dev`), at any severity.
- **Whole lockfile:** zero **high or critical** advisories, ever. Medium and low advisories are listed by advisory
  id in the allowlist, with an owner and expiry.
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

[`benchmarks/quality-allowlist.json`](../benchmarks/quality-allowlist.json) is the only place existing debt is written
down. Its sections match the checks:

| Section | Keyed by | Ceiling |
| --- | --- | --- |
| `fileSize` | file | lines |
| `complexity` | file and function name | complexity |
| `asUnknownAs` | file | count |
| `nonNull` | all of `src/` | count |
| `boundaries` | file and rule | count |
| `audit` | advisory id | none; listed advisories only, medium or low |

Every entry has `owner` (an issue number as `#<n>`), `expires` (on or before **2027-01-26**), and `reason`. The
checker refuses an entry that lacks one of them.

**Editing rules.** An entry is removed or tightened, never raised or added to pass a change. Changing a ceiling
upward is a new debt decision and belongs in its own reviewed pull request with a new owner issue.
When `npm run check:quality` says an entry is now N, set that number; the checker prints the value it measured, so no
number is typed from memory. An entry is never added by hand to make a change pass.

## Follow-up work

None of these is done by this change. Each needs an owner issue; the proposed titles are in the pull request
description for the maintainer to approve.

1. Split `src/source-usage.ts` below 1,000 lines, then below 800; remove both entries.
2. Split `src/reporters.ts` below 800 lines; remove the entry.
3. Reduce the 191 functions over 15, starting with the 105 over 20.
4. Remove the 9 `as unknown as` casts, then the 589 non-null assertions, by area.
5. Move the detector import out of `src/github-action.ts`.
6. Add a dependency-cruiser configuration or an architecture test for the transitive network rule and rules 4 and 5.
7. Triage the root lockfile's medium and low advisories, and the high advisories in `examples/` and `extensions/vscode/`.
8. Add a docs test that every CLI command and flag is documented.
9. Clean the Seaworthy and docs-doctor findings, then make them gate (see the condition in [Docs](#7-docs)).
10. Set `thresholds.break` when the first complete mutation score exists (see [Mutation](#6-mutation-score)).
11. Raise the Scorecard score to 6.0 (see [Security](#8-security)).

## Peer comparison

Each target is compared with a published practice or tool default. The links are the sources.

| Criterion | Peer practice | Evergreen target | Source |
| --- | --- | --- | --- |
| File size | 100 lines is a reasonable change; 1,000 lines is usually too large. ESLint's `max-lines` default is 300 per file. | Median 300, ceiling 1,000, warning at 800 | [Google eng-practices: small CLs](https://google.github.io/eng-practices/review/developer/small-cls.html), [ESLint `max-lines`](https://eslint.org/docs/latest/rules/max-lines) |
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
