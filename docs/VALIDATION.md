---
title: v0.1 validation
---

# v0.1 validation

Evergreen v0.1 was validated on 2026-10-14 against 20 public repositories pinned to immutable commits: ten Node.js repositories, nine Python repositories, and one Node.js/GitHub Actions repository. The complete corpus and expected finding locations live in `benchmarks/public-repositories.json`; the executable harness is `benchmarks/public-repositories.ts`.

## Results

| Measure | Result |
| --- | ---: |
| Repositories | 20 |
| Expected findings | 27 |
| True positives | 27 |
| False positives | 0 |
| False negatives | 0 |
| Precision | 1.0000 |
| Recall | 1.0000 |
| Median scan time | 8.19 ms |
| p95 scan time | 48.88 ms |
| Slowest scan | 49.73 ms |

Scan time measures only local Evergreen analysis after checkout. It excludes network and Git operations, which the harness reports separately as `checkoutMs` per repository and `medianCheckoutMs`, `p95CheckoutMs`, and `slowestCheckoutMs` in the summary, so Evergreen's own cost is never mixed with the time spent downloading a repository. The run used the development machine, so duration is a reference rather than a cross-machine guarantee.

## GitHub Actions corpus additions

The corpus has since grown to 30 repositories. The ten added entries are GitHub Actions repositories taken from reviewed migration commits (see [Mining migrations](../benchmarks/mining/queries.md)). Eight are pinned to the commit *before* a migration, where Evergreen must report exactly the workflow locations the migration changed, and two are pinned to the migration commit itself, where it must report nothing. Together they include reusable workflows (`Akenon-Studio/.github`) and SHA-pinned actions (`smartcrabai/paperhanger`, `openmcp-project/crossplane-headlamp-plugin`).

Every expected finding in these entries has `groundTruthSource.kind` set to `migration-commit` and links to the commit that fixed it; a test checks each link against `benchmarks/mining/review-log.json`. A SHA-pinned entry is only accepted as zero-finding after checking that no pinned reference carries a version comment below the rule's supported major, because Evergreen does not classify SHA pins yet and would otherwise hide a deprecated version. Across all 30 repositories the harness reports 48 expected findings, 48 true positives, and no false positives or false negatives (observed 2026-10-16). The table above is the original 20-repository v0.1 run.

## Method

Every expected result is identified by rule ID, repository-relative path, and line at a pinned commit. The harness downloads each commit to a temporary directory, runs all built-in detectors, compares sets in both directions, reports per-repository timing, and removes the checkout. It exits unsuccessfully for any unexpected or missing finding.

```bash
npm run validate:public-repos
```

The audit covers both positive and zero-finding repositories across npm/Node.js, Python, and GitHub Actions. Findings were checked against their repository declarations and the authoritative sources bundled with the matching lifecycle rule.

## The 50-repository corpus

The corpus now has 50 repositories: the 20 from v0.1, the ten GitHub Actions entries above, and twenty more across the shipped detectors.

- Sixteen are pinned to the parent of a reviewed migration commit: six clean ones where the migration explains every finding (node-sass removals, Python runtime floors raised to a supported release), and ten where other deprecated declarations were still present. Findings that the migration fixed cite it with `groundTruthSource.kind` `migration-commit`; the rest are `maintainer-review` and quote the exact line that was read at that commit.
- Four are zero-finding repositories, including monorepos (`withastro/astro`, `vitest-dev/vitest`, `lerna/lerna`, `changesets/changesets`). They were also searched by hand for deprecated actions, runtimes and packages, independently of Evergreen's own rules.

The review tool (`benchmarks/mining/review.ts`) now accepts npm package, Python package, and Node.js and Python runtime rules as well as GitHub Actions rules, and `mine.ts` can mine one group at a time and append without replacing reviewed candidates (`--queries npm,python --limit 10 --append`). Across all 50 repositories the harness reports 81 expected findings, 81 true positives, no false positives and no false negatives (observed 2026-10-16).

## Precision thresholds

[`benchmarks/thresholds.json`](../benchmarks/thresholds.json) sets a precision floor per detector (`github-actions`, `nodejs`, `npm`, `python`; a detector is named by the first segment of its rule ids). The harness scores each detector, prints the figures under `detectors` in its JSON, and reports `thresholdViolations`. A stable detector below its `minPrecision` (0.95 today) fails the run with a line such as:

```text
THRESHOLD  npm: precision 0.9 is below the required 0.95
```

The weekly corpus workflow therefore fails on a precision regression even if the exact-match comparison is later relaxed. Mark a new detector `"stable": false` until its corpus coverage is meaningful; it is still scored and reported but never fails the run. Never lower a floor to make a run pass.

## Weekly run and refreshing pins

Pull request CI never touches the network, so the corpus is checked by [`.github/workflows/corpus.yml`](../.github/workflows/corpus.yml) every Monday and on demand (Actions → Public corpus → Run workflow). The result is uploaded as the `corpus-result-<run id>` artifact even when the comparison fails. A failing run prints one line per mismatch, for example:

```text
UNEXPECTED owner/repo@4ec1ebe0fa: github-actions.setup-node.node20:.github/workflows/ci.yml:20
MISSING    owner/repo@4ec1ebe0fa: nodejs.runtime.eol-18:package.json:83
```

`UNEXPECTED` means Evergreen reported a finding the corpus does not list; `MISSING` means a listed finding was not reported. Because every commit is pinned, a mismatch means Evergreen's rules or detectors changed, not the repository. Decide which side is right before touching the corpus: fix the detector or rule when the corpus is right, and update the expected entry (with its `groundTruthSource`) only when the new result is correct.

To move an entry to a newer commit, change its `commit` to the full 40-character SHA, run `npm run observe:public-repos` to list what Evergreen now reports, review every difference against the repository at that commit, update `expected`, and run `npm run validate:public-repos` until it passes. Never refresh a pin only to make a failing run green.

## Interpretation and limits

Precision and recall are measured only against Evergreen's documented v0.1 rule set and the pinned corpus. They do not mean Evergreen detects every possible deprecation in these ecosystems. The corpus is public and reproducible, but not a statistically representative sample of all software. Dynamic action references and unsupported ecosystems remain intentionally unclassified.

The controlled source-usage benchmark provides a separate exact-match test for imports, calls, and configuration keys; see [Benchmarks](BENCHMARKS.md).
