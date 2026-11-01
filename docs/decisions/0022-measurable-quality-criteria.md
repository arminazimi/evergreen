# 0022 — Define reference quality as measurable criteria

Status: proposed — maintainer acceptance is pending.

## Problem

The repository says it aims at "reference quality" but has no definition of what that means. Some checks
exist and are enforced: the TypeScript compiler, the test suite, coverage floors on `main`, generated
documentation checks. Others are conventions that only a reviewer can catch: file size, function
complexity, import boundaries. A third group exists but does not fail anything: mutation score, broken
documentation links, dependency advisories behind the Scorecard result.

Without a written definition, "reference quality" cannot be reviewed or regressed against. A contributor
cannot tell which numbers are requirements, which are goals, and which are claims nobody measured. The
project can also accidentally claim a target is met when the only measurement is a human reading the
diff.

## Decision

1. **Eight criteria define reference quality**: file size, complexity, type safety, boundaries, coverage,
   mutation score, docs, and security. [QUALITY.md](../QUALITY.md) holds the target, the tool or command
   that measures it, the current number, and whether CI enforces it for each one.
2. **No target without a measurement.** A criterion the repository does not measure is marked as a gap
   with the measurement to add. It is not reported as met, even when the current code looks compliant.
   This is why boundaries, complexity, mutation score, and parts of docs and security are gaps today.
3. **Targets are set from existing tools and published practice, not invented numbers.**
   - File size: median 300, warning at 800, hard ceiling 1,000 lines per hand-written source file.
   - Complexity: 15 per function, ceiling 20.
   - Type safety: the current strict flags plus `noImplicitOverride`, zero explicit `any`, zero
     `@ts-ignore` / `@ts-expect-error`.
   - Boundaries: six import and trust rules already stated in `AGENTS.md` and `ARCHITECTURE.md`, made
     checkable.
   - Coverage: the floors already in `package.json` — 93% lines, 87% branches, 93% functions — and no
     pull request lowers a changed source file's line coverage by more than one percentage point.
   - Mutation score: break at 60, high at 80, on the four mutated core areas.
   - Docs: the generated command registry and documentation pages stay current, every CLI command and
     flag is documented, `llms-full.txt` and the generated reference/answer/OG pages match their
     sources, and the built site has no broken internal links or accessibility errors.
   - Security: no vulnerabilities in shipped dependencies, no high or critical advisories in the
     lockfile, no open high or critical CodeQL alerts, no new self-scan findings, and an OpenSSF
     Scorecard of at least 6.0 at v0.8.0 and 7.0 at v1.0, with every check at least 5 except the policy
     exceptions already explained in `SECURITY.md` (branch protection, review policy, and badge
     detection).
4. **Each target is compared with a published peer practice**, with the source linked in QUALITY.md:
   Google's change-size guidance and ESLint's `max-lines` default, ESLint's `complexity` default, the
   `sindresorhus/tsconfig` strictest preset, Kubernetes `import-boss`, OpenSSF Best Practices coverage
   criteria, Stryker's default thresholds, Google's documentation guidance and Diátaxis, and the OpenSSF
   Scorecard checks.
5. **Closing a gap is separate work.** This decision adds no linter, no dependency-cruiser, no audit
   gate, and no new CI step. QUALITY.md lists the follow-ups; each needs its own issue and pull request,
   with any new dependency justified there.
6. **The document and this record change together.** Raising or lowering a target, or moving a target
   from gap to enforced, changes both files. The status stays `proposed` until the maintainer accepts
   the targets; acceptance does not renumber this record.

## Why

- **A claim needs a command.** Every target in QUALITY.md names the exact command or CI job that produces
  its number. A reader can reproduce it, and a reviewer can tell a requirement from an aspiration.
- **Honesty is part of the quality bar.** The repository's product rule is that a lifecycle claim needs an
  authoritative, cited source. Applying the same rule inward means no "we have good coverage" without the
  floor, and no "mutation testing works" while `break` is `null`.
- **The numbers follow the tools.** Using ESLint's defaults and Stryker's defaults keeps the targets
  defensible before the project has its own baseline; the stricter values are stated as targets, not as
  measurements.
- **The gaps are real and visible.** Scorecard is 4.8, two files exceed the size warning line and one
  exceeds the ceiling, and the docs site checks are report-only. A definition that hid those facts would
  not be a definition of quality.

## Consequences

- Contributors can be held to a target only after its measurement exists. Today that means type safety
  (compiler), coverage (floors on `main`, changed-file drops on pull requests), and the generated docs
  checks are enforceable; complexity, file size,
  boundaries, mutation score, site links, and dependency advisories are not yet.
- The follow-up list in QUALITY.md is the input for new issues. Adding ESLint or dependency-cruiser needs a
  dependency check under `AGENTS.md` and a reason in its pull request.
- The coverage floors still run only on pushes to `main`. Pull requests fail only when a changed file's
  line coverage drops by more than one percentage point, and new files are skipped; that is a gap in
  enforcement, not a target change.
- The Scorecard target depends on repository settings and dependency updates outside this record. The
  exceptions already in `SECURITY.md` stay in force; this record does not silently raise them.
- No runtime behavior, scan output, registry data, or public API changes. Scans stay offline.
