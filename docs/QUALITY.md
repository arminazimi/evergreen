---
title: Reference quality
description: The measurable targets Evergreen holds its own code, data, and documentation to, with the command that checks each one.
---

# Reference quality

Evergreen is meant to be a reference implementation: evidence-backed findings, deterministic output, and a
local-first trust model. "Reference quality" only means something if it can be checked. This page defines
it as eight criteria, each with a target, the tool or command that measures it, the current number, and
whether the repository enforces it today.

This page describes **this repository**. It says nothing about the quality of repositories Evergreen
scans, and it adds no network access to any scan.

The proposal is recorded in [decision 0022](decisions/0022-measurable-quality-criteria.md). That record
is **proposed**: these targets become the reference standard when the maintainer accepts them.

Measurement snapshot: **2026-11-01**, Node.js 22.23.1, TypeScript 5.9.3. Numbers are a snapshot, not a
contract; the command beside each one is what to re-run.

## Targets at a glance

| # | Criterion | Target | Measured by | Current | Enforced today |
| --- | --- | --- | --- | --- | --- |
| 1 | File size | Median ≤300 lines; no hand-written file over 1,000 | `find` + `wc` (see below) | Median 121; two files over 800 | No — gap |
| 2 | Complexity | Cyclomatic complexity ≤15 per function, ceiling 20 | Not measured | Unknown | No — gap |
| 3 | Type safety | Clean `tsc` on strict flags; no `any`, no `@ts-ignore` | `npm run build` + `grep` | 0 `any`, 0 `@ts-ignore`, 8 `as unknown as` | Compiler only |
| 4 | Boundaries | Six import and trust rules from `AGENTS.md` | Not measured | Holds by inspection | No — gap |
| 5 | Coverage | Lines ≥93, branches ≥87, functions ≥93 | `npm run test:coverage` | 94.75 / 87.04 / 94.60 | Floors on `main`; 1 pp PR check |
| 6 | Mutation score | Break at 60, high at 80 | `npm run test:mutation` | See below | No — break is `null` |
| 7 | Docs | Generated indexes, pages, links, and site build agree | `npm run check`, `check:*`, CI | Generated checks pass; links report-only | Partly |
| 8 | Security | No shipped vulnerabilities; Scorecard ≥6.0 by v0.8.0 | `npm audit`, Scorecard API, CodeQL | Runtime audit 0; Scorecard 4.8 | Partly |

A target marked **gap** is not met as a process even when the number looks good: nothing in CI fails when
it regresses. The fix is named in the row and collected under [follow-up work](#follow-up-work); none of
those tools is added by this document.

## 1. File size

**Target.** A hand-written TypeScript file above **800 lines** needs a reason in review, and **1,000 lines
is the hard ceiling**: a file over it fails. The median file stays at or below **300 lines**. Files under
`src/usage/vendor/`, generated files, and fixtures are excluded.

**Measured by.**

```bash
find src -name '*.ts' -not -path '*/vendor/*' -not -name '*.generated.ts' -exec wc -l {} + | sort -n
```

**Current.** 304 hand-written source files. Median 121 lines. Two files are over 800 lines:
`src/reporters.ts` (911) and `src/source-usage.ts` (1,985). The second also breaks the 1,000-line ceiling.
Every other source file is below 800.

**Enforced.** No. `npm run check` has no file-size step and the repository has no linter, so the ceiling
is advice. The two oversized files predate this page and stay until they are split.

**Gap and follow-up.** Add a `max-lines` check — either ESLint's `max-lines` rule or a small
`tools/check-quality.ts` that reads the same `find` output — with a short allowlist for the two files
above, and remove each file from the allowlist when it is split. Splitting `src/source-usage.ts` is its
own change, not part of this decision.

**Why these numbers.** Google's code-review guidance calls 100 lines a reasonable change and 1,000 lines
usually too large; that guidance is about the size of a change, not one file. ESLint's `max-lines` rule
defaults to 300 lines per file. The targets use the 300-line default for the median and Google's
1,000-line figure as the hard cap, with 800 as a warning line. Sources are in
[peer comparison](#peer-comparison).

## 2. Complexity

**Target.** Cyclomatic complexity per function is at most **15**; **20 is the absolute ceiling** (ESLint's
default). A function above 15 needs a written reason in review, and a function above 20 fails. Complexity
is measured per function, not per file.

**Measured by.** Nothing today. `npm run check` builds and tests; it does not run a linter, and
`devDependencies` contains no ESLint or complexity tool. The current distribution is unknown.

**Enforced.** No — **gap**.

**Gap and follow-up.** Add ESLint with `typescript-eslint` and the `complexity` rule at 15, run through a
new `npm run lint:complexity` step in `npm run check`. That adds a dev dependency, so it needs its own
pull request with the reason and an Evergreen dependency check, as `AGENTS.md` requires. Until that lands,
no complexity target may be reported as met.

## 3. Type safety

**Target.** The whole tree compiles under `strict`, `noUncheckedIndexedAccess`, and
`exactOptionalPropertyTypes`. Hand-written `src/**/*.ts` contains **zero explicit `any`** and **zero
`@ts-ignore` / `@ts-expect-error`**. `noImplicitOverride` is on. `as unknown as` and non-null assertions are
counted, and a change that adds one explains why in review.

**Measured by.**

```bash
npm run build
grep -rnwE '(: any\b|as any\b|<any>|any\[\])' src --include='*.ts' | grep -v '/vendor/'
grep -rnE '@ts-(ignore|expect-error)' src --include='*.ts' | grep -v '/vendor/'
grep -rn 'as unknown as' src --include='*.ts' | grep -v '/vendor/'
grep -rnE '[A-Za-z0-9_)\]]!\.' src --include='*.ts' | grep -v '/vendor/'
```

**Current.** `tsconfig.json` sets `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`;
`npm run build` passes. 0 explicit `any`, 0 `@ts-ignore`/`@ts-expect-error`, 8 `as unknown as`, and 104
grep matches for non-null assertions (an approximation; the last two are tracked, not capped).
`skipLibCheck` stays on deliberately: it skips type checking inside dependencies, not in Evergreen's own
code. `noImplicitOverride` is **not** set.

**Enforced.** The compiler is the gate and `npm run check` runs it. The escape-hatch counts are not
enforced; nothing fails when they grow.

**Gap and follow-up.** Turn on `noImplicitOverride` (and evaluate `noUnusedLocals` / `noUnusedParameters`)
in a dedicated change that fixes the resulting errors. Add the `grep` counts to that check so a new `any`
fails review mechanically instead of by memory.

**Why these flags.** The `sindresorhus/tsconfig` strictest preset — a widely used base for Node.js
packages — sets `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, and
`noUnusedLocals` together. Evergreen already matches the first two; the target closes the rest.

## 4. Boundaries

**Target.** These rules hold, and a violation fails a check rather than a review:

1. `src/engine.ts` and `src/domain.ts` do not import `src/detectors/**`.
2. `src/detectors/**` does not import `node:net`, `node:http`, `node:https`, `node:dgram`, `node:tls`, or
   `node:child_process`, and contains no `fetch(` call.
3. `registry/**` contains JSON data only — no executable code.
4. `src/source-usage.ts` holds repository traversal and matching, not detector-specific rules.
5. Adapters (`src/cli.ts`, `src/mcp.ts`, `src/github-action.ts`, `skills/`, `plugins/`) translate an
   interface; they do not own detector, rule, or migration logic.
6. Scans stay offline: no detector or engine path reads the network.

The rules themselves come from [Architecture](ARCHITECTURE.md#trust-boundaries) and
[AGENTS.md](../AGENTS.md#architecture-boundaries); this page only makes them checkable.

**Measured by.** Nothing today. On 2026-11-01 rules 1–3 hold by inspection:

```bash
grep -nE '^import .*detectors|from "\./detectors' src/engine.ts src/domain.ts
grep -rnE '^import .*node:(net|http|https|dgram|tls|child_process)' src/detectors --include='*.ts'
grep -rn 'fetch(' src/detectors --include='*.ts'
find registry -type f ! -name '*.json'
```

The commands return no imports or calls; rules 4–6 are review-only.

**Enforced.** No — **gap**.

**Gap and follow-up.** Add `dependency-cruiser` with `forbidden` rules for 1–3 and a narrow rule for 4–5,
or an architecture test under `tests/` if that avoids a new dependency. Run it from `npm run check`.
Kubernetes enforces the same idea with `import-boss` and `.import-restrictions` files; Evergreen has no
equivalent yet.

## 5. Coverage

**Target.** `npm run test:coverage` stays at or above the floors already declared in `package.json`:
**93% lines, 87% branches, 93% functions**. A pull request does not lower a changed source file's line
coverage by more than **1 percentage point**.

**Measured by.**

```bash
npm run test:coverage
node dist/tools/coverage-diff.js --base <main.lcov> --head lcov.info --changed-files <list>
```

The first command excludes `dist/tests/**`, `dist/benchmarks/**`, `dist/action/**`, and
`dist/src/usage/vendor/**`, so the number describes Evergreen's own source. The second is the pull-request
comparison CI already runs.

**Current.** 94.75% lines, 87.04% branches, 94.60% functions (2026-11-01, local run). The branch floor has
about 0.04 points of headroom.

**Enforced.** Partly. `ci.yml` runs the floors on pushes to `main`. On pull requests it downloads the last
`main` LCOV and runs `tools/coverage-diff.ts`, which fails when a changed `src/` file's **line** coverage
drops by more than one percentage point. That check does not compare new files or files absent from the
base report (`skipped`), does not check branch or function coverage per file, and does not run the overall
floors.

**Gap and follow-up.** Run the overall floors on pull requests too, and count new files as a regression
unless they meet the floor, so the failure lands on the change that caused it.

**Why this level.** OpenSSF Best Practices asks for at least 80% statement coverage at silver and at
least 80% branch coverage at gold. Evergreen's declared floors are above both; the gap is enforcement,
not ambition.

## 6. Mutation score

**Target.** On the mutated core — `src/engine.ts`, `src/baseline.ts`, `src/diff.ts`, and `src/vers/**/*.ts`
— the mutation score stays at or above **60%** (`break`), with **80%** as the high-water mark. A score
below 60 fails the run.

**Measured by.**

```bash
npm run test:mutation
```

Stryker writes `artifacts/mutation-report.json`; `.github/workflows/mutation.yml` runs it nightly and
publishes the score, killed/survived counts, and surviving mutants to the job summary.

**Current.** The configuration sets `high: 80` and `low: 60` but `break: null`, so Stryker never exits
non-zero on a low score. The nightly summary is the only record. A full run is not part of `npm run check`
(it takes too long), and this document does not claim a score it did not measure.

**Enforced.** No — **gap**.

**Gap and follow-up.** Set `thresholds.break` to 60 so the nightly job fails on a regression, and record
the last score with its date here after the first run under that gate.

**Why these numbers.** They are Stryker's own defaults for `high` and `low`. Google's testing blog defines
the mutation score as the ratio of mutants its tests detect and calls it the "holy grail" of evaluating
test quality; the target uses Stryker's defaults rather than inventing a stricter number before the
repository has a baseline.

## 7. Docs

**Target.**

- The generated command registry is current (`tools/generate-commands-index.mjs --check` in
  `npm run check`), and every command module is represented in the CLI help that `renderHelp()` builds.
- Every CLI command and public option has a page or section that documents it, and every command, path,
  and environment variable that a guide names exists in the code.
- `docs/llms-full.txt` matches the pages linked from `docs/llms.txt`.
- Reference pages, answer pages, and Open Graph images match `registry/*.json`.
- The README coverage table names the files each detector actually reads and the commands it documents
  exist (`tests/readme-coverage.test.ts` and the other `tests/docs-*.test.ts` files).
- The documentation site builds, and the built site has **zero broken internal links** and no
  accessibility errors at the level Seaworthy checks.

**Measured by.**

```bash
npm run check                 # command registry + docs tests
npm run check:llms
npm run check:reference
npm run check:answer-pages
npm run check:og-images
```

CI builds the Jekyll site for documentation-only pull requests, the docs doctor builds it for any pull
request that touches `docs/`, and the docs doctor runs Slipway's `doctor` over `docs/`.

**Current.** The generated checks and the docs tests pass in `npm run check`, and the four `check:*`
commands run in CI. There is no test that every CLI command and flag appears in a documentation page: the
existing docs tests check selected pages (`DATA.md`, `IMPORTERS.md`, the scaffold guide, MCP, rules, and
releasing), not the whole CLI surface. The two site checks are **report-only**: `ci.yml` runs Seaworthy
with `--fail-on none`, and `docs-doctor.yml` sets `level: none`. A broken internal link or a failing docs
rule warns without failing anything.

**Enforced.** Partly: the command registry, generated pages, and the selected-page docs tests fail CI;
complete command/flag documentation coverage, links, and accessibility do not.

**Gap and follow-up.** Add a `tests/docs-cli.test.ts` that compares `renderHelp(commands)` — commands,
options, and arguments — with the documentation pages, and fix the gaps it finds. Clean the existing
Seaworthy findings, then change `--fail-on none` to `--fail-on error` and raise the docs-doctor level to
the level the site reaches. Until then, "every command documented" and "no broken links" are goals, not
gates.

**Why this shape.** Google's documentation guide asks for documentation changes in the same change as the
code, Diátaxis separates tutorials, how-to guides, reference, and explanation by user need, and OpenSSF
Best Practices requires basic documentation plus reference documentation of the external interface. The
targets above are the mechanical part of those expectations.

## 8. Security

**Target.**

- **Shipped dependencies:** zero known vulnerabilities in runtime dependencies
  (`npm audit --omit=dev`).
- **Whole lockfile:** zero high or critical advisories (`npm audit`); moderate and low findings are
  triaged in an issue with a decision to update, accept, or remove the dependency.
- **Static analysis:** no open high or critical CodeQL alerts.
- **Self-scan:** no finding outside `.evergreen-baseline.json` on a push to `main`.
- **Scorecard:** overall **≥6.0 by v0.8.0** and **≥7.0 by v1.0**, with every check at least 5 except the
  policy exceptions already explained in [SECURITY.md](../SECURITY.md#openssf-scorecard):
  Branch-Protection (administrator scope), Code-Review (reviews are expected, not required), and
  CII-Best-Practices (the badge is held but not detected at scan time).
- **Workflows:** every third-party Action is pinned to a full commit SHA on `main`, except the SLSA
  reusable workflow that `SECURITY.md` documents as intentionally tag-pinned, and `actionlint` plus
  `zizmor` pass on workflow changes.

**Measured by.**

```bash
npm audit --omit=dev --json
npm audit --json
curl --tlsv1.2 -fsSL https://api.securityscorecards.dev/projects/github.com/arminazimi/evergreen
gh api 'repos/arminazimi/evergreen/code-scanning/alerts?state=open'
```

`self-scan` and `workflow-lint` run in CI; CodeQL and Scorecard run weekly and publish to code scanning.

**Current (2026-11-01).** Runtime audit: 0 vulnerabilities. Full audit: 5 moderate, 0 high, 0 critical.
Scorecard: **4.8** (published 2026-10-31 for commit `cfff3c5`). The checks behind that number:

| Scorecard check | Score | Note |
| --- | ---: | --- |
| Vulnerabilities | 0 | 58 OSV advisories across the repository's dependency manifests; `npm audit --omit=dev` is clean |
| Dangerous-Workflow | 0 | `workflow_run` checkouts in `release.yml` |
| Code-Review | 0 | 0 of 8 approved changesets; reviews are expected but not required (documented in `SECURITY.md`) |
| Pinned-Dependencies | 4 | `release.yml` tag and container base images not pinned by digest |
| Signed-Releases | 2 | 1 of the last 4 releases has a signed artifact |
| CII-Best-Practices | 0 | the badge is held but was not detected at scan time |
| Contributors | 3 | one contributing organization |
| Binary-Artifacts | 5 | the vendored tree-sitter `.wasm` files |
| Maintained | 0 | repository age at the time of the scan |
| Branch-Protection | -1 | not readable with the workflow token (admin scope) |
| Everything else | 7–10 | SAST 7, CI-Tests 10, Fuzzing 10, Security-Policy 10, Token-Permissions 10 |

**Enforced.** Partly. CodeQL, Scorecard, self-scan, and workflow lint run, but nothing fails on the
Scorecard number, and no CI job runs `npm audit`, so dependency advisories are visible only when someone
looks.

**Gaps and follow-up.** Add `npm audit --audit-level=high` (runtime and full lockfile separately) to CI;
triage the development-dependency advisories behind the Scorecard Vulnerabilities result; pin the
remaining container images and the SLSA reusable workflow by digest or record why not; review the
`workflow_run` checkouts in `release.yml`; run `workflow-lint.yml` on pull requests that change
`.github/**` or `action.yml` instead of only on pushes to `main`; and decide whether to require approvals
on `main` (the `SECURITY.md` exception says no). The Scorecard target cannot be met by editing this
document.

## Peer comparison

Each target is compared with a published practice or tool default. The links are the sources; none of the
numbers below are estimated from memory.

| Criterion | Peer practice | Evergreen target | Source |
| --- | --- | --- | --- |
| File size | 100 lines is a reasonable change; 1,000 lines is usually too large. ESLint's `max-lines` default is 300 per file. | Median 300, hard ceiling 1,000, warning at 800 | [Google eng-practices: small CLs](https://google.github.io/eng-practices/review/developer/small-cls.html), [ESLint `max-lines`](https://eslint.org/docs/latest/rules/max-lines) |
| Complexity | ESLint's `complexity` rule defaults to 20 per function. | 15 per function, ceiling 20 | [ESLint `complexity`](https://eslint.org/docs/latest/rules/complexity) |
| Type safety | The strictest `sindresorhus/tsconfig` preset sets `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, and unused checks. | All of those, plus zero `any` and zero `@ts-ignore` | [`sindresorhus/tsconfig`](https://github.com/sindresorhus/tsconfig) |
| Boundaries | Kubernetes enforces package import rules with `import-boss` and `.import-restrictions` files. | Six rules, mechanically checked | [`k8s.io/gengo/examples/import-boss`](https://pkg.go.dev/k8s.io/gengo/examples/import-boss) |
| Coverage | OpenSSF Best Practices asks for 80% statement coverage at silver and 80% branch coverage at gold. | 93% lines, 87% branches, 93% functions | [OpenSSF Best Practices criteria](https://www.bestpractices.dev/criteria) |
| Mutation score | Stryker defaults to `high: 80`, `low: 60`, `break: null`; Google's testing blog defines the mutation score as the ratio of mutants detected by tests. | Break at 60, high at 80 | [Stryker configuration](https://stryker-mutator.io/docs/stryker-js/configuration/), [Google Testing Blog: mutation testing](https://testing.googleblog.com/2021/04/mutation-testing.html) |
| Docs | Change documentation in the same change as the code; divide docs into tutorials, how-to, reference, and explanation; document the external interface. | Generated pages current, site links and a11y clean | [Google documentation best practices](https://google.github.io/styleguide/docguide/best_practices.html), [Diátaxis](https://diataxis.fr/), [OpenSSF criteria](https://www.bestpractices.dev/criteria) |
| Security | OpenSSF Scorecard scores 18 repository checks from 0 to 10, including Code-Review, Pinned-Dependencies, Vulnerabilities, and Dangerous-Workflow. | Scorecard ≥6.0 at v0.8.0, ≥7.0 at v1.0, exceptions documented | [Scorecard checks](https://github.com/ossf/scorecard/blob/main/docs/checks.md) |

## Follow-up work

None of these is done by this document. Each needs its own issue and pull request, in this order:

1. Add a file-size check with an allowlist for `src/reporters.ts` and `src/source-usage.ts`.
2. Split `src/source-usage.ts`, then remove it from the allowlist.
3. Add complexity linting (`eslint` + `typescript-eslint` + `complexity`) and run it in `npm run check`.
4. Turn on `noImplicitOverride`, then evaluate the unused-symbol checks.
5. Add the boundary rules as a `dependency-cruiser` configuration or an architecture test.
6. Run the overall coverage floors on pull requests, and count new files as regressions unless they meet
   the floor.
7. Set `thresholds.break` to 60 and record the first gated mutation score here.
8. Add a docs test that every CLI command and flag is documented, and fix the gaps it finds.
9. Make Seaworthy and the docs doctor fail on errors once the existing findings are fixed.
10. Add `npm audit` to CI and triage the development-dependency advisories behind the Scorecard result.
11. Work through the Scorecard gaps (pinning, signed releases, workflow-run checkouts, reviews), run
    workflow lint on pull requests, or extend the documented exceptions with a reason.

## What this page does not claim

- No target marked **gap** is met as a process, even where the current number is good.
- The numbers are a snapshot from one machine on 2026-11-01; re-run the command to check today.
- Adding or changing a target is a decision, not a documentation edit: update this page and
  [decision 0022](decisions/0022-measurable-quality-criteria.md) together.
- Maintainer acceptance of decision 0022 is pending. Until it is accepted, these targets are a proposal
  under review, not a standard contributors can be held to.
