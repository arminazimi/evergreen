# 0025 — Choose ESLint with typescript-eslint for lint, Biome for format

Status: accepted

## Problem

Evergreen has strict TypeScript, a custom quality checker, and Stryker, but no
repository linter or formatter. Style and many type-safety bugs stay review
work. Epic #1987 needs one written choice before later tasks add a formatter
(#2045), type-aware lint with a shrinking baseline (#2046), bans on `any` and
unsafe casts (#2047), and floating-promise / empty-catch rules (#2048).

On 2026-11-03, `main` still has none of ESLint, Biome, or Prettier in
`package.json`. The gap is real; this record picks the tools only.

## Options compared

Candidates named in the issue: **ESLint with typescript-eslint**, and **Biome**.
Prettier is included only as the usual formatter pair for ESLint, so format
speed has a measured baseline.

| Axis | ESLint + typescript-eslint | Biome |
| --- | --- | --- |
| Type-aware rules | Uses the TypeScript program (`projectService`). typescript-eslint ships **63** rules that require type information, including `no-floating-promises`, `no-misused-promises`, and the `no-unsafe-*` family. | Own type inference (no `tsc`). Typed rules live under the `types` domain; `noFloatingPromises` is still **nursery**. Biome's own release notes put floating-promise recall at about **75%** of typescript-eslint. |
| Formatter | None built in; needs Prettier or Biome format. | Built in; one binary for lint and format. |
| Upkeep | Flat config + plugin surface; rule and version churn across ESLint and typescript-eslint. | One package and one config; smaller ecosystem and fewer typed rules today. |

## Measurements

Same machine (Apple A18 Pro, Node.js v26.12.0), same tree tip, **479** hand-written
`.ts` files under `src/` and `tools/` (vendor trees excluded). Tools were installed
outside the repository so this record does not change dependencies. Versions:
ESLint **10.14.0**, typescript-eslint **8.72.1**, Biome **2.6.4**, Prettier **3.6.2**,
TypeScript **5.9.3**. Wall-clock times are the **median of three runs** unless noted.

| Run | Config | Median wall time | Notes |
| --- | --- | --- | --- |
| `tsc --noEmit` | repository `tsconfig.json` | **57.7 s** (one run) | Full program check; reference for typed cost. |
| ESLint type-aware | `recommendedTypeChecked` plus floating-promise / `no-unsafe-*` / `no-explicit-any` | **16.9 s** | Exit 1; **152** problems on this corpus (unsafe assignments/members/args, unnecessary assertions, `await-thenable`, and related). |
| Biome lint | recommended + `noExplicitAny` | **0.61 s** | Exit 1; **69** errors, **809** warnings (many `noNonNullAssertion`). |
| Biome lint (typed) | `domains.types` + `domains.project` = `all`, plus nursery `noFloatingPromises` | **0.88 s** | Exit 1; **135** errors. Extra cost is small; findings were mostly `noUndeclaredDependencies` and `noImplicitAnyLet`, not floating promises. |
| Biome format check | `biome ci --linter-enabled=false` | **0.81 s** | Exit 1; **369** files would change under the trial config. |
| Prettier `--check` | same 479 files | **27.8 s** | Exit 1; **407** files would change. |

On a small fixture both tools catch a naked `returnsPromise()` call and an
`as any` cast. On this repository, ESLint's program-backed `no-unsafe-*` rules
fire in volume; Biome has no equivalent family backed by `tsc`, and
`noFloatingPromises` reported **no** hits here while still marked nursery.

## Decision

1. **Lint with ESLint and typescript-eslint**, with type-aware rules enabled
   through the TypeScript project service. Later epic tasks turn on the typed
   rules they need and keep baselines that can only shrink.
2. **Format with Biome** (formatter only for the default check path). Biome's
   format check is about **30×** faster than Prettier on this corpus and keeps
   formatting in one Rust binary without a third JS toolchain.
3. **Do not use Biome as the type-aware linter** for the #1987 exit criteria.
   Approximate inference and nursery typed rules are not enough for "forbid
   floating promises with no baseline left" and for unsafe-cast coverage that
   matches the TypeScript checker already in the repo.
4. **Do not add Prettier.** Format belongs to Biome; lint belongs to ESLint.
   Disable Biome's linter (or leave it unused) in the default `npm run check`
   path so the two tools do not fight over the same diagnostics.

This record chooses the tools only. Installing them, formatting the tree, and
wiring rules into `npm run check` are later issues in the epic.

## Why

- **Typed lint is the scarce resource.** Follow-ups need rules that read the
  real TypeScript program. That is typescript-eslint's job today; Biome's
  inference is faster but incomplete by its own numbers.
- **Format is a speed and upkeep problem.** Once lint is settled on ESLint,
  Biome format beats Prettier on measured wall time here and avoids maintaining
  Prettier alongside ESLint.
- **One responsibility each.** Splitting lint and format keeps typed-rule
  upgrades in the ESLint config and format policy in `biome.json`, which matches
  how #2045 and #2046 are split.

## Consequences

- #2045 adds Biome 2.6.4 as a devDependency, wires `format:check` into
  `npm run check`, and formats the tree in one commit; unformatted code fails
  the check. Re-wrapping `src/sdk.ts` and `src/mcp.ts` in that commit changes
  whitespace only, so neither public contract changes.
- #2046 adds ESLint with typescript-eslint, enables type-aware rules, and
  records a shrinking baseline.
- #2047 and #2048 tighten typed rules on top of that ESLint config.
- No runtime dependency and no network use in scans. DevDependency pins and
  exact rule sets land in the implementation pull requests, not here.
