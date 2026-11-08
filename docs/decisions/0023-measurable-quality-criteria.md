# 0023 — Define reference quality as measurable, enforced criteria

Status: accepted

## Problem

The repository says it aims at "reference quality" but had no definition of what that means. Some checks
were enforced: the TypeScript compiler, the test suite, coverage floors on `main`, generated documentation
checks. Others were conventions only a reviewer could catch: file size, function complexity, import
boundaries. Some were measured but failed nothing: mutation score, broken documentation links, dependency
advisories behind the Scorecard result.

A definition that is measured but not enforced does not change what a pull request can merge. Debt in the
measured-but-unenforced areas then grows with every change, and nobody is obliged to pay it down.

## Decision

The maintainer widened the scope of issue #2041 on purpose: reference quality is enforced strictly from now
on, at the start of an agent's work, while it works, and in CI. Technical debt stops growing now and has an
end date. The rules below record that.

1. **Nine criteria define reference quality**: file size, function size, complexity, type safety, boundaries,
   coverage, mutation score, docs, and security. [QUALITY.md](../QUALITY.md) holds each target, the check that enforces
   it, the current number, and the check that keeps the allowlist empty.
2. **Every criterion is enforced by a failing check.** The check runs in `npm run check` (the gate CI runs) or
   in a named CI job that a pull request cannot merge past. "Measured but not enforced" is not allowed. Where a
   rule cannot be checked mechanically, QUALITY.md says so and the rule stays a review rule. Mutation score is
   the one exception with a written condition: it is gated by the first complete measured run, in its own pull
   request, inside the v0.8.0 phase.
3. **Zero new debt.** A change may not add a file, function, or count worse than its target. There is no soft
   threshold for new code: it fails.
4. **There is no debt.** The allowlist, `benchmarks/quality-allowlist.json`, is empty in every section and
   `npm run check:quality` fails on any entry. A change meets a target by fixing the code, never by adding an
   entry, raising a ceiling, or extending a date.
5. **Targets are set from existing tools and published practice, not invented numbers.**
   - File size: median 300 lines or fewer; a file over 800 needs an entry; none over 1,000 without one.
   - Function size: 50 lines per function, measured from its first line through its closing brace with the
     TypeScript compiler API; a longer function needs an entry.
   - Complexity: 15 per function, measured per function with the TypeScript compiler API; 20 is the reviewer's
     ceiling.
   - Type safety: zero explicit `any` and zero `@ts-ignore` / `@ts-expect-error`; `as unknown as` and non-null
     assertions may not grow; `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
     `noImplicitOverride`, `noUnusedLocals`, and `noUnusedParameters` are on.
   - Boundaries: the six import and trust rules in `AGENTS.md`, each either checked mechanically or named as a
     review rule in QUALITY.md.
   - Coverage: the floors in `package.json` (93% lines, 87% branches, 93% functions), enforced on pull requests
     as well as `main`, and no total may fall below `main`'s report beyond rounding.
   - Mutation score: break at 60, high at 80, on the four mutated core areas, gated as in rule 2.
   - Docs: generated pages, indexes, the LLM index, and the data API match their sources and gate CI; links and
     accessibility gate once their findings are cleared, on the condition in QUALITY.md.
   - Security: `npm audit --omit=dev` fails on any runtime advisory; the full lockfile may carry medium and low
     advisories only when listed by id in the allowlist; high and critical advisories never pass; a scheduled
     workflow fails below an OpenSSF Scorecard of 6.0 at v0.8.0 and 7.0 at v1.0.
6. **Each target is compared with a published peer practice**, with the source linked in QUALITY.md: Google's
   change-size guidance, ESLint's `max-lines`, `max-lines-per-function`, and `complexity` defaults, the `sindresorhus/tsconfig` strictest
   preset, Kubernetes `import-boss`, OpenSSF Best Practices, Stryker's thresholds, Google's documentation
   guidance and Diátaxis, and the OpenSSF Scorecard checks.
7. **Agents hear the rules before and while they work.** AGENTS.md has a Quality bar section, the pull request
   and task templates name it, and the opt-in pre-push hook runs `npm run check:rules` when a push touches
   sources, tooling, or the allowlist.
8. **This record and the document change together.** Raising a target, adding an allowlist entry, or moving a
   target to enforced changes both files. The status is `accepted`; the allowlist is empty, so the
   only change left to make there is none.

## Why

- **A claim needs a check.** A target that only a reviewer can see is an opinion. Every target in QUALITY.md
  names the check that produces its number, so a reader can reproduce it and a failing run blocks the change.
- **Debt with an end date is honest.** Existing debt is measured and written down with its current value. A
  ceiling that can only shrink stops growth now and gives the cleanup a date, without blocking unrelated work.
- **The numbers follow the tools.** ESLint's and Stryker's defaults keep the targets defensible before the
  project has its own baseline. The stricter values are stated as targets, not as measurements.
- **The facts are visible.** At adoption the code carried debt that was written down with an owner and an expiry
  rather than hidden. It has all been paid off (#2283), and the empty allowlist is now enforced.

## Consequences

- Pull requests that touch `src/`, `tools/`, `tests/`, or `benchmarks/` fail when they add debt. The check
  reports each violation with its file, function or rule, and the step to take.
- Adding ESLint, dependency-cruiser, or any other package needs its own dependency reason under `AGENTS.md`.
  This record adds none.
- The coverage floors run on pull requests, and a pull request may not lower a total below `main`. The per-file
  one-point check still applies to changed files.
- The Scorecard floor workflow fails until the published score reaches 6.0. That failure is the alert this record
  asks for, and it stays until the score moves.
- The allowlist is empty and `npm run check:quality` rejects any entry, so the expiry date no longer matters: there
  is no debt left to expire.
- No runtime behavior, scan output, registry data, or public API changes. Scans stay offline.
