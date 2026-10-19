# 0013 — Detector maturity levels and the evidence to move between them

Status: accepted

## Problem

Epics for Rust (#46), .NET (#48), and Java and Kotlin (#49) list "detector maturity is at least `beta`" and "precision on the independent corpus is at least 0.95" as exit criteria, but nothing says what `beta` is or how much evidence earns it. The only machine-readable signal is `stable` in `benchmarks/thresholds.json`, which says whether the precision floor is enforced and not why. Three consequences:

- Epics were closed with their criteria unmet, and the reason lived only in a comment.
- The documentation says `Supported` and `Experimental`; the roadmap says `beta`; the thresholds file says `stable`.
- Four detectors are enforced today (`github-actions`, `nodejs`, `npm`, `python`) on evidence that differs by an order of magnitude, and nothing records that.

## Decision

### 1. Three levels, one vocabulary

| Level | Shown in the docs as | What it promises users | Precision floor in CI |
|---|---|---|---|
| `experimental` | Experimental | It runs and is usable. Findings, rule ids, and unclassified output may change between releases without notice. | Scored and reported, never fails the run. |
| `beta` | Beta | Findings were checked against ground truth on enough repositories to measure them. A change to a rule id, a finding id, or a documented declaration form is listed in the changelog. | Enforced (0.95). |
| `stable` | Supported | The same as beta, on a larger and more varied corpus, and part of the documented product contract. | Enforced (0.95). |

`Supported` in the docs is the word for `stable`. The thresholds file gains a `level` field with these three values; `stable: true` means `level` is `beta` or `stable` (the floor is enforced), and a test keeps the two in step.

### 2. Evidence required, per detector

A detector is named by the first segment of its rule ids. "Repositories with findings" counts corpus repositories that have at least one expected finding of that detector; "zero-finding repositories" counts corpus repositories of the detector's ecosystem with no expected findings at all.

| | experimental | beta | stable |
|---|---|---|---|
| Conformance suite passes on positive, negative, zero, and malformed fixtures | yes | yes | yes |
| Repositories with findings | 1 | 8 | 20 |
| Expected findings (all with a `groundTruthSource`) | 1 | 15 | 60 |
| Zero-finding repositories | 1 | 2 | 4 |
| Precision on the whole corpus | reported | at least 0.95 | at least 0.95 |
| Recall on the whole corpus | reported | at least 0.80 | at least 0.90 |
| Selection | any | at least half of the repositories chosen blind | at least two thirds chosen blind |
| A full corpus run on the current main, recorded in the thresholds file | no | within 30 days | within 30 days |
| A detector page in `docs/detectors/` stating what is and is not judged | yes | yes | yes |

**Blind** means the repository was chosen by a rule fixed before running Evergreen on it (for example the first results of a public search query, minus forks and archives), not because it is known to contain a finding. A repository picked because it had a migration commit is useful ground truth but is a targeted pick, and the corpus must say which is which: each corpus entry gains `selection: "targeted" | "blind"`.

**Independent ground truth** is one of the kinds the corpus already records: a maintainer's own migration commit, an upstream changelog or release note, a vendor lifecycle page, or a reviewer's written check of the cited line. It is never Evergreen's own output.

### 3. Who decides, and where it is recorded

A promotion is a pull request that changes `level` in `benchmarks/thresholds.json` and records, next to it, the corpus run the claim rests on (date, commit, per-detector precision, recall, and the counts above). The maintainer merges it. A comment on an epic is not a record. An epic's exit criterion "maturity is at least X" is met only when the thresholds file says so.

A demotion is the same pull request in reverse and is also required when a full run shows precision or recall below the floor and it is not fixed within 30 days.

### 4. Epic exit criteria

Exit criteria that mention maturity should say "at the level in the thresholds file", not a fixed word. An epic whose work is finished but whose detector has not earned the next level is closed with a follow-up issue naming the missing evidence, as for #727 and #736.

## Applying it to today's detectors

Counts are from `benchmarks/public-repositories.json` on 2026-10-19 (90 repositories). Precision and recall are from the full run recorded in `benchmarks/thresholds.json` (`lastFullRun`): 85 repositories on commit `b19a781`, 336 reported findings, 336 true positives, 0 false positives, 0 false negatives.

| Detector | Level today | Repositories with findings | Expected findings | Zero-finding repositories | Meets |
|---|---|---|---|---|---|
| github-actions | stable | 33 | 205 | 2 | beta (stable needs 4 zero-finding repositories) |
| nodejs | stable | 12 | 40 | 8 | beta (stable needs 20 repositories and 60 findings) |
| python | stable | 17 | 19 | 2 | beta (stable needs 20 repositories, 60 findings, 4 zero) |
| npm | stable | 8 | 10 | 8 | experimental (beta needs 15 findings) |
| container | experimental | 6 | 16 | 1 | experimental (beta needs 8 repositories and 2 zero) |
| .NET | experimental | 5 | 23 | 1 | experimental (beta needs 8 repositories and 2 zero) |
| Go | experimental | 4 | 7 | 1 | experimental |
| Java and Kotlin | experimental | 4 | 6 | 1 | experimental |
| Kubernetes | experimental | 4 | 9 | 1 | experimental |
| Rust | experimental | 4 | 5 | 1 | experimental |

Every detector scored precision 1 and recall 1 in that run, so the precision and recall rows of the table are met by all ten detectors and do not separate them. That is a weaker statement than it sounds: the expected findings were written by reviewing the files at each pinned commit, and the corpus was grown until it matched, so 1.0 shows that nothing regressed, not that the detectors generalize. Only blind-selected repositories and more of them can show that, which is why the evidence table counts repositories and selection and not just the score.

Selection (`blind` or `targeted`) is not recorded yet, so the selection row cannot be checked for any detector; recording it is part of this change.

The four detectors that predate this decision keep their current `Supported` label as a **grandfathered** state, listed by name in the test that enforces the table. The record states plainly that none of them reaches `stable` on the numbers above and that `npm` is below `beta` on expected findings. Growing the corpus (#141 and #142) is how they earn the label, not a reason to hide the gap.

## Alternatives rejected

- **Keep `stable` as a boolean.** It cannot tell a detector with 201 expected findings from one with 10.
- **Fixed numbers inside the epics.** They drift and are checked by nobody; the thresholds file is checked by CI.
- **Require recall only for `stable`.** A detector that misses half of what is there is not a beta promise.

## Consequences

- `benchmarks/thresholds.json` gains `level` and a `run` record; a test checks that `level` agrees with `stable`, with the `Status` column of `docs/COMPATIBILITY.md`, and that each `beta` and `stable` detector meets the counts above (the grandfathered ones are named).
- The corpus schema gains an optional `selection` field. Adding it to the existing 85 entries is a separate change; until then blind-selection is reported as unknown.
- No detector changes level in this record. Promotions follow, one pull request each, with their corpus run.
- Recall becomes a measured number per detector; today only precision is computed.

## Update 2026-10-19: .NET promoted to beta (#736)

The .NET corpus grew from six repositories to eighteen: six targeted and twelve chosen blind by the rule in [Validation](../VALIDATION.md#net-blind-selection). Counts for the `dotnet` detector on 2026-10-19: nine repositories with findings, 84 expected findings, nine zero-finding repositories, and twelve of eighteen repositories blind, which meets every row of the beta column. The full run recorded in `benchmarks/thresholds.json` reported precision 1 and recall 1 for `dotnet`; recall was also checked by hand over the blind repositories (see [.NET](../detectors/dotnet.md#validation)), which found one gap before the promotion (no rule for the 1.x, 2.x, and 3.0 lines) and closed it. The two .NET repositories with workflow findings also raise GitHub Actions to 35 repositories with findings and 211 expected findings; the table above is the 90-repository snapshot and is left as written. The selection row is now checked by the test for any detector that records `selection`; entries without it count as not blind.
