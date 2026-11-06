---
title: Comparison method
description: The protocol, fixed before any result exists, for comparing Evergreen with Renovate, Dependabot, and endoflife.date-based tools — the tools, versions, repositories, measures, and each tool's best configuration.
---

# Comparison method

The protocol for measuring Evergreen against the tools developers already run. It is published
before any result exists, so no measure, repository, or configuration can be chosen to fit an
outcome. [#2173](https://github.com/arminazimi/evergreen/issues/2173),
[#2174](https://github.com/arminazimi/evergreen/issues/2174), and
[#2175](https://github.com/arminazimi/evergreen/issues/2175) run it; this page decides in advance
what those runs may report.

**Published before results:** 2026-11-03, written against `origin/main` at `9d81af78`
(Evergreen `0.7.3`). At that commit `benchmarks/comparison/` — where the runs write their results —
does not exist, and neither does `docs/COMPARISON.md`. Every number below is read from a file in the
repository, named beside it; none is estimated. Where something is not measurable yet this page says
so instead of guessing.

## 1. What this page contains, and what it must not

| This page fixes | This page never contains |
| --- | --- |
| The tools, their versions, and where a version is recorded. | Any count of agreements, misses, or wins. |
| The repositories that are in scope and how a subset is chosen. | A result table. Those go to `benchmarks/comparison/` and [#2177](https://github.com/arminazimi/evergreen/issues/2177). |
| The measures, their formulas, and the floors already enforced. | A new threshold invented after a run. |
| Each tool's best configuration, and what cannot be measured. | A proxy measurement standing in for a tool that cannot run. |

The order is the point. [docs/REVIEW.md](REVIEW.md) blocks a merge on overclaimed proof, so this page
describes the machinery that exists and says plainly that it is not stronger or more complete than the
[differential testing already recorded](validation/differential-testing.md) — it extends the same
harness to a head-to-head measurement with the fairness rules written down first.

## 2. The precedent this method follows

Two mechanisms in this repository already separate the rule from the result, and the comparison reuses
them rather than inventing a third:

- **The held-out set** is "chosen by a rule fixed before scanning and its ground truth was committed
  before the first scan", and its run "reports its numbers and never fails the build"
  ([`benchmarks/held-out.ts`](../benchmarks/held-out.ts), header;
  [`benchmarks/held-out-repositories.json`](../benchmarks/held-out-repositories.json): 15 repositories,
  all `selection: "blind"`, scope of 4 rule families).
- **Blind corpus selection**: each of the 557 corpus entries records `selection` as `blind` or
  `targeted`, and a test fails when one does not ([docs/VALIDATION.md](VALIDATION.md#precision-thresholds)).
  Measured in [`benchmarks/public-repositories/`](../benchmarks/public-repositories/): 389 blind, 168 targeted.

## 3. Tools and versions

The comparison runs only tools a maintainer executes outside any scan, as the existing differential
harness does; scans stay offline and never execute repository code
([docs/ARCHITECTURE.md](ARCHITECTURE.md#trust-boundaries)).

| Tool | Question it answers | Runner in this repository | Version rule |
| --- | --- | --- | --- |
| Evergreen | Which declared or used dependency, runtime, image, or API is ending, and where | the built CLI, offline | the commit under test; recorded with the run |
| Renovate | Does a newer version exist, and is this npm package deprecated | `npm run differential:renovate` ([`benchmarks/differential/renovate.ts`](../benchmarks/differential/renovate.ts)) | pinned and printed per run; the last recorded differential run used 44.164 (`docs/validation/differential-testing.md`) |
| xeol (an endoflife.date consumer) | Which product version in a lockfile is past end of life | `npm run differential:xeol` ([`benchmarks/differential/xeol.ts`](../benchmarks/differential/xeol.ts)) | pinned and printed per run; the last recorded run used 0.10.8 (same file) |
| Pluto | Does Kubernetes still serve this `apiVersion` | `npm run differential:pluto` ([`benchmarks/differential/pluto.ts`](../benchmarks/differential/pluto.ts)) | pinned and printed per run; the last recorded run used 5.24.4 at target `k8s=v1.36.0` (same file) |
| Dependabot | Which updates or security advisories GitHub opens for a repository | **none exists** — `package.json` has no Dependabot runner (measured: `grep -n dependabot package.json` returns nothing) | not measurable at a pinned commit today; see section 7 |

Renovate, xeol, and Pluto versions are **recorded at run time** into the result file. This page pins no
version for the new runs, because a version chosen now would be a version nobody has checked the
availability of; the run records it instead, and a re-run that changes a version says so.

## 4. Repositories

- **Primary set**: the pinned public corpus, [`benchmarks/public-repositories/`](../benchmarks/public-repositories/) —
  one JSON file per repository, 557 entries across 20 ecosystem directories. Every entry pins a full
  commit SHA and carries `expected` findings; measured: 3,122 expected records, all 3,122 carrying a
  `groundTruthSource` (3,080 `maintainer-review`, 42 `migration-commit`).
- **Scored separately, never blended**: `blind` and `targeted` entries are reported as two columns.
  A result that mixes them is rejected, because the targeted half was chosen for the findings it holds.
- **Held-out set**: the 15 repositories of `benchmarks/held-out-repositories.json`, reported separately
  from the main corpus, as `npm run validate:held-out` already does.
- **Continuity set**: the repositories that already have committed differential reports, so a new run
  is comparable with the recorded one — measured file counts: 5 Renovate reports in
  [`benchmarks/differential/reports/`](../benchmarks/differential/reports/), 5 xeol reports, 17 Pluto reports.
- **Subset rule, fixed now**: a run uses the blind half of the corpus plus every repository in the
  continuity set. Any other subset must be written here, with its selection rule and a date, before the
  first command of the run executes.

## 5. Measures and their formulas

Every measure already has an implementation; the comparison uses it rather than a new definition.

| Measure | Definition | Source of the definition |
| --- | --- | --- |
| Finding identity | `ruleId : path : line` — exact, so a near match earns no credit | `findingKey` in [`benchmarks/thresholds.ts`](../benchmarks/thresholds.ts) |
| True positive / false positive / false negative | expected-and-reported / reported-and-unexpected / expected-and-missing | `scoreDetectors` in the same file |
| Precision | `tp / (tp + fp)`, `1` when both are zero, to 4 decimals | `scoreDetectors`, same file |
| Recall | `tp / (tp + fn)` | `recallViolations`, same file |
| Agreement outcome | `agree`, `evergreen-only`, `<tool>-only`, `inconclusive`; Pluto adds `pluto-deprecated-only` | the four harnesses in `benchmarks/differential/` |
| Not comparable | a finding in a family the other tool has no model for | `notComparable` in every committed report |
| Wall clock | the command's own duration per repository, observational | the same treatment as `docs/BENCHMARKS.md`: "a reference point, not a cross-machine performance guarantee" |

Existing floors stay in force and are reported, not re-derived: `minPrecision` 0.95 on all 24 detectors
in [`benchmarks/thresholds.json`](../benchmarks/thresholds.json), enforced where `stable` is true (11 of 24:
6 at `stable`, 5 at `beta`); recall floors `beta` 0.8 and `stable` 0.9
([`benchmarks/thresholds.ts`](../benchmarks/thresholds.ts), `recallFloors`, decision 0013). The last
recorded full corpus run is `2026-11-01` at commit `114f19b`: 557 repositories, 3,156 findings reported,
precision 1, recall 1 (`lastFullRun` in `benchmarks/thresholds.json`). Those findings and the 3,122
expected records above are different counts — one is what Evergreen reported, one is what the corpus
expects — and are never compared to each other as if they were the same measure.

**Comparability is a hard gate, not a courtesy.** A pair is counted only where both tools can say
something about the same dependency in the same file, which is what the Renovate harness restricts to
three families (`deprecated-package`, `base-image`, `github-action`). A finding outside that is `not
comparable` and may not be reported as a win, a loss, or a miss. `inconclusive` — a tool that skipped a
lookup — is excluded from both the numerator and the denominator, and the count excluded is published.

## 6. Each tool gets its best configuration

The fairness rule: no tool is run with a capability disabled that another tool is given, and no tool is
given a configuration tuned on a result. What "best" means for each, with the commands taken from
`docs/validation/differential-testing.md` and `package.json`:

| Tool | Best configuration, and the command that proves it |
| --- | --- |
| Evergreen | the built CLI, offline, on the pinned commit, every built-in detector, cache bypassed, no severity gate, no narrowing: `npm run build && node dist/src/cli.js scan <checkout> --no-cache --json`. `--no-cache` and `--json` are parsed in `src/commands/runtime.ts`; `--only` / `--exclude` exist and are forbidden here because they would remove findings before scoring. |
| Renovate | a read-only token so GitHub Actions lookups resolve instead of returning `github-token-required`: `export RENOVATE_TOKEN=<token> GITHUB_COM_TOKEN=<token>` then `npx renovate --platform=local --dry-run=lookup --report-type=file --report-path=renovate.json`, then `npm run differential:renovate -- --renovate renovate.json --repository <checkout> --name owner/repo --out report.json` |
| xeol | `xeol dir:<checkout> -o json > xeol.json`, then `npm run differential:xeol -- --xeol xeol.json --repository <checkout> --name owner/repo --out report.json` |
| Pluto | run from inside the checkout, with an explicit target version: `(cd <checkout> && pluto detect-files -d . -o json -t k8s=v1.36.0 > pluto.json)`, then `npm run differential:pluto -- --pluto pluto.json --repository <checkout> --name owner/repo --out report.json` |
| Dependabot | no local command exists. `evergreen dependabot-config .` writes a `dependabot.yml` for a repository to use
([`src/commands/dependabot-config.ts`](../src/commands/dependabot-config.ts)); that is Evergreen's output, not a Dependabot measurement, and must not be scored as one. |

The comparison repositories are checked out of the pinned corpus cache, offline, as `AGENTS.md`
prescribes: `export EVERGREEN_CORPUS_CACHE=~/.cache/evergreen-corpus`, `npm run corpus:warm`, then run
with `--offline`; `--concurrency` stays at its default of 16
(`DEFAULT_CORPUS_CONCURRENCY` in [`benchmarks/corpus-harness.ts`](../benchmarks/corpus-harness.ts)).
Nothing this method adds runs repository code, evaluates a manifest, or touches the network from a scan.

## 7. What cannot be measured, stated in advance

Declared before the first run, so no run can quietly redefine a limit as a result:

- **Dependabot**: it runs inside GitHub's service on a repository's default branch, not against a pinned
  commit offline. There is no runner in this repository. A head-to-head number for it is therefore
  **not measured**; if a run is ever possible, it is on a live repository, and that difference from the
  pinned-commit method is published in the same table as its result.
- **Runtime and API findings against Renovate and xeol**: those tools model no runtime end-of-life or
  retired-API question, so Evergreen's largest families are not comparable with them. Recorded as not
  comparable, never as a win.
- **Update automation in Evergreen's favour**: Evergreen opens nothing and runs no migration command;
  the reverse direction (Renovate's automation) is a capability Evergreen does not have and does not score.
- **Product breadth versus endoflife.date** for [#2175](https://github.com/arminazimi/evergreen/issues/2175)
  is measured against the ground-truth set, and that set's expansion is
  [#2168](https://github.com/arminazimi/evergreen/issues/2168), open at the time this page was written.
  Until it lands, the available ground truth is the corpus's 3,122 reviewed records above, and any
  breadth figure drawn from it must be labelled with that scope.
- **Cross-machine timing**: durations are recorded per machine and never compared across machines as a
  result, matching `docs/BENCHMARKS.md`.

## 8. Binding rules for the run and for publishing

1. This page is amended only by a dated entry that states whether the amendment was made after seeing a
   result; a measure changed after a run forces a fresh run of both tools, published together.
2. Both tools run on the same checkout at the same commit, in the same working tree, and the commit is
   in the result file.
3. Every disagreement is published as its own row with the evidence link, as
   [docs/differential-report.md](differential-report.md) already does for Renovate. Aggregate claims
   without the row table are rejected.
4. Losses are published with the same detail as wins; the report where the other tool found more is
   the headline of the run that produced it. [#2177](https://github.com/arminazimi/evergreen/issues/2177)
   carries that page.
5. No result changes a registry rule, a threshold, a floor, or an allowlist entry as part of the run
   ([docs/QUALITY.md](QUALITY.md): an entry may never be added or raised to make something pass).
6. `npm run check` gates every run's pull request, and `npm run validate:public-repos` is not part of it
   — it needs the network, so a run records how it was executed and whether the cache was warm.

## 9. Reproducing the method, not a result

These commands build and score Evergreen's own half. They exist in `package.json`; run them from a clean
checkout of the commit being measured.

```bash
npm ci
npm run build
npm run check                    # the gate CI runs
npm run corpus:warm              # needs EVERGREEN_CORPUS_CACHE and network
npm run validate:public-repos -- --offline
npm run validate:held-out
npm run differential:report      # rebuilds docs/differential-report.md from committed reports
```

Results of the comparison itself are produced by
[#2173](https://github.com/arminazimi/evergreen/issues/2173)/[#2174](https://github.com/arminazimi/evergreen/issues/2174)/[#2175](https://github.com/arminazimi/evergreen/issues/2175)
into `benchmarks/comparison/`, packaged by
[#2176](https://github.com/arminazimi/evergreen/issues/2176), and published with the losses in
[#2177](https://github.com/arminazimi/evergreen/issues/2177). [#2176](https://github.com/arminazimi/evergreen/issues/2176)
also owns later edits to this page: when one command exists that reproduces a published table, it is
recorded here.

## 10. Where the comparison claims are already made

The tool-by-tool pages state what each alternative does better today, and each links its evidence:
[docs/compare/index.md](compare/index.md), [Renovate](compare/renovate.md),
[Dependabot](compare/dependabot.md), [endoflife.date](compare/endoflife-date.md). They are prose claims
about capability, not measurements, and they do not cite this page's method as a result. When the runs
land, the measured tables belong to `docs/COMPARISON.md` and point back here for the method.
