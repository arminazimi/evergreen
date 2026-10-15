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

Scan time measures only local Evergreen analysis after checkout. It excludes network and Git operations. The run used the development machine, so duration is a reference rather than a cross-machine guarantee.

## GitHub Actions corpus additions

The corpus has since grown to 30 repositories. The ten added entries are GitHub Actions repositories taken from reviewed migration commits (see [Mining migrations](../benchmarks/mining/queries.md)). Eight are pinned to the commit *before* a migration, where Evergreen must report exactly the workflow locations the migration changed, and two are pinned to the migration commit itself, where it must report nothing. Together they include reusable workflows (`Akenon-Studio/.github`) and SHA-pinned actions (`smartcrabai/paperhanger`, `openmcp-project/crossplane-headlamp-plugin`).

Every expected finding in these entries has `groundTruthSource.kind` set to `migration-commit` and links to the commit that fixed it; a test checks each link against `benchmarks/mining/review-log.json`. A SHA-pinned entry is only accepted as zero-finding after checking that no pinned reference carries a version comment below the rule's supported major, because Evergreen does not classify SHA pins yet and would otherwise hide a deprecated version. Across all 30 repositories the harness reports 48 expected findings, 48 true positives, and no false positives or false negatives (observed 2026-10-16). The table above is the original 20-repository v0.1 run.

## Method

Every expected result is identified by rule ID, repository-relative path, and line at a pinned commit. The harness downloads each commit to a temporary directory, runs all built-in detectors, compares sets in both directions, reports per-repository timing, and removes the checkout. It exits unsuccessfully for any unexpected or missing finding.

```bash
npm run validate:public-repos
```

The audit covers both positive and zero-finding repositories across npm/Node.js, Python, and GitHub Actions. Findings were checked against their repository declarations and the authoritative sources bundled with the matching lifecycle rule.

## Interpretation and limits

Precision and recall are measured only against Evergreen's documented v0.1 rule set and the pinned corpus. They do not mean Evergreen detects every possible deprecation in these ecosystems. The corpus is public and reproducible, but not a statistically representative sample of all software. Dynamic action references and unsupported ecosystems remain intentionally unclassified.

The controlled source-usage benchmark provides a separate exact-match test for imports, calls, and configuration keys; see [Benchmarks](BENCHMARKS.md).
