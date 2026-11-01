---
title: v0.1 validation
---

# v0.1 validation

Evergreen v0.1 was validated on 2026-10-14 against 20 public repositories pinned to immutable commits: ten Node.js repositories, nine Python repositories, and one Node.js/GitHub Actions repository. The complete corpus and expected finding locations live in `benchmarks/public-repositories.json`; the executable harness is `benchmarks/public-repositories.ts`.

## Results

Moved to [Validation corpus: Results](validation/corpus.md#results).

## GitHub Actions corpus additions

Moved to [Validation corpus: GitHub Actions corpus additions](validation/corpus.md#github-actions-corpus-additions).

## Method

Moved to [Validation corpus: Method](validation/corpus.md#method).

## The 50-repository corpus

Moved to [Validation corpus: The 50-repository corpus](validation/corpus.md#the-50-repository-corpus).

## Kubernetes corpus

Moved to [Ecosystem corpora: Kubernetes corpus](validation/ecosystems.md#kubernetes-corpus).

## Kubernetes blind selection

Moved to [Ecosystem corpora: Kubernetes blind selection](validation/ecosystems.md#kubernetes-blind-selection).

## Java and Kotlin corpus

Moved to [Ecosystem corpora: Java and Kotlin corpus](validation/ecosystems.md#java-and-kotlin-corpus).

## Java and Kotlin blind selection

Moved to [Ecosystem corpora: Java and Kotlin blind selection](validation/ecosystems.md#java-and-kotlin-blind-selection).

## Ruby corpus

Moved to [Ecosystem corpora: Ruby corpus](validation/ecosystems.md#ruby-corpus).

## PHP corpus

Moved to [Ecosystem corpora: PHP corpus](validation/ecosystems.md#php-corpus).

## Swift corpus

Moved to [Ecosystem corpora: Swift corpus](validation/ecosystems.md#swift-corpus).

## Swift blind selection

Moved to [Ecosystem corpora: Swift blind selection](validation/ecosystems.md#swift-blind-selection).

## Serverless corpus

Moved to [Ecosystem corpora: Serverless corpus](validation/ecosystems.md#serverless-corpus).

## Serverless blind selection

Moved to [Ecosystem corpora: Serverless blind selection](validation/ecosystems.md#serverless-blind-selection).

## .NET blind selection

Moved to [Ecosystem corpora: .NET blind selection](validation/ecosystems.md#net-blind-selection).

## CI runner images corpus

Moved to [Ecosystem corpora: CI runner images corpus](validation/ecosystems.md#ci-runner-images-corpus).

## The 300-repository corpus

Moved to [Validation corpus: The 300-repository corpus](validation/corpus.md#the-300-repository-corpus).

## The 456-repository corpus

Moved to [Validation corpus: The 456-repository corpus](validation/corpus.md#the-456-repository-corpus).

## The held-out set

Moved to [Validation corpus: The held-out set](validation/corpus.md#the-held-out-set).

## Precision thresholds

[`benchmarks/thresholds.json`](../benchmarks/thresholds.json) sets a precision floor per detector (`github-actions`, `nodejs`, `npm`, `python`, `dotnet`, `java`, `kubernetes`, `serverless`, and `swift` enforce it; a detector is named by the first segment of its rule ids). The harness scores each detector, prints the figures under `detectors` in its JSON, and reports `thresholdViolations`. A stable detector below its `minPrecision` (0.95 today) fails the run with a line such as:

```text
THRESHOLD  npm: precision 0.9 is below the required 0.95
```

A detector at `beta` or `stable` also has a recall floor, 0.80 and 0.90 (decision 0013), computed as true positives over true positives plus false negatives; a full run below it prints `THRESHOLD  <detector>: recall … is below the required …`, fails, and cannot be recorded. Every corpus entry records `selection` (`blind` or `targeted`), and a test fails when one does not; entries added before the field existed were all picked from reviewed migration commits or known findings, so they record `targeted`.

The weekly corpus workflow therefore fails on a precision regression even if the exact-match comparison is later relaxed. Mark a new detector `"stable": false` until its corpus coverage is meaningful; it is still scored and reported but never fails the run. Never lower a floor to make a run pass.

## Fetching and the checkout cache

Moved to [Running the corpus: Fetching and the checkout cache](validation/running-the-corpus.md#fetching-and-the-checkout-cache).

## Running a subset

Moved to [Running the corpus: Running a subset](validation/running-the-corpus.md#running-a-subset).

### Re-running only what failed

Moved to [Running the corpus: Re-running only what failed](validation/running-the-corpus.md#re-running-only-what-failed).

### Comparing with an earlier run

Moved to [Running the corpus: Comparing with an earlier run](validation/running-the-corpus.md#comparing-with-an-earlier-run).

### Managing the cache

Moved to [Running the corpus: Managing the cache](validation/running-the-corpus.md#managing-the-cache).

### Warm ahead, run offline

Moved to [Running the corpus: Warm ahead, run offline](validation/running-the-corpus.md#warm-ahead-run-offline).

### Running only what a change affects

Moved to [Running the corpus: Running only what a change affects](validation/running-the-corpus.md#running-only-what-a-change-affects).

## Run cost and budget

Moved to [Running the corpus: Run cost and budget](validation/running-the-corpus.md#run-cost-and-budget).

## Stalled fetches

Moved to [Running the corpus: Stalled fetches](validation/running-the-corpus.md#stalled-fetches).

## Reading a run

Moved to [Running the corpus: Reading a run](validation/running-the-corpus.md#reading-a-run).

## Recording a full run

Moved to [Running the corpus: Recording a full run](validation/running-the-corpus.md#recording-a-full-run).

## Pull request check

Moved to [Running the corpus: Pull request check](validation/running-the-corpus.md#pull-request-check).

## Keeping `lastFullRun` current

Moved to [Running the corpus: Keeping `lastFullRun` current](validation/running-the-corpus.md#keeping-lastfullrun-current).

## Weekly run and refreshing pins

Moved to [Running the corpus: Weekly run and refreshing pins](validation/running-the-corpus.md#weekly-run-and-refreshing-pins).

## Differential testing against Renovate

Moved to [Differential testing: Differential testing against Renovate](validation/differential-testing.md#differential-testing-against-renovate).

## Differential testing against xeol

Moved to [Differential testing: Differential testing against xeol](validation/differential-testing.md#differential-testing-against-xeol).

## Differential testing against Pluto

Moved to [Differential testing: Differential testing against Pluto](validation/differential-testing.md#differential-testing-against-pluto).

## Accuracy by detector

Precision is true positives over true positives plus false positives; recall is true positives over true positives plus false negatives. Both come from the last full corpus run recorded in [`benchmarks/thresholds.json`](../benchmarks/thresholds.json), so a reader can regenerate every number: run `npm run record:corpus-run`, then `npm run build:coverage`. The table below is generated; a test fails when it drifts from the recorded run. `nodejs` is the Node.js runtime rules served by the npm detector. A dash means the last full run did not score that detector.

<!-- accuracy-tables:start -->
Measured on 456 pinned repositories at commit `c7b4e14` on 2026-10-24. Regenerate with `npm run build:coverage` after `npm run record:corpus-run`.

| Detector | Maturity | True positives | False positives | False negatives | Precision | Recall |
| --- | --- | --- | --- | --- | --- | --- |
| android | Experimental | 9 | 0 | 0 | 1.000 | 1.000 |
| ci-images | Experimental | 13 | 0 | 0 | 1.000 | 1.000 |
| container | Experimental | 74 | 0 | 0 | 1.000 | 1.000 |
| cpp | Experimental | 18 | 0 | 0 | 1.000 | 1.000 |
| dart | Experimental | 8 | 0 | 0 | 1.000 | 1.000 |
| database | Experimental | 16 | 0 | 0 | 1.000 | 1.000 |
| deno | Experimental | — | — | — | — | — |
| dotnet | Beta | 304 | 0 | 0 | 1.000 | 1.000 |
| elixir | Experimental | — | — | — | — | — |
| github-actions | Supported | 986 | 0 | 0 | 1.000 | 1.000 |
| go | Experimental | 54 | 0 | 0 | 1.000 | 1.000 |
| java | Beta | 61 | 0 | 0 | 1.000 | 1.000 |
| kubernetes | Beta | 71 | 0 | 0 | 1.000 | 1.000 |
| nodejs | Supported | 305 | 0 | 0 | 1.000 | 1.000 |
| npm | Supported | 100 | 0 | 0 | 1.000 | 1.000 |
| php | Experimental | 5 | 0 | 0 | 1.000 | 1.000 |
| python | Supported | 74 | 0 | 0 | 1.000 | 1.000 |
| ruby | Experimental | 24 | 0 | 0 | 1.000 | 1.000 |
| rust | Experimental | 18 | 0 | 0 | 1.000 | 1.000 |
| scala | Experimental | — | — | — | — | — |
| serverless | Beta | 26 | 0 | 0 | 1.000 | 1.000 |
| shell | Experimental | 12 | 0 | 0 | 1.000 | 1.000 |
| swift | Beta | 16 | 0 | 0 | 1.000 | 1.000 |
| terraform | Experimental | 7 | 0 | 0 | 1.000 | 1.000 |
<!-- accuracy-tables:end -->

## Mutation testing baseline

Line coverage shows which lines run; mutation testing asks whether the tests would notice a bug in them. `npm run test:mutation` runs [Stryker](https://stryker-mutator.io/) with the command runner over `src/engine.ts`, `src/baseline.ts`, `src/diff.ts`, and `src/vers/`, rebuilding with `tsc` and executing the unit tests that target those modules. The nightly [Mutation](../.github/workflows/mutation.yml) workflow publishes the score and surviving mutants in the job summary. It does not fail the build on the score yet.

First measured score on 2026-10-30 (commit `470542f4`): **59.59%** (1,139 killed, 7 timed out, 777 survived; 1,923 mutants). Per-file: `src/vers/` 80.12%, `src/baseline.ts` 72.78%, `src/diff.ts` 57.94%, `src/engine.ts` 23.12%.

## Interpretation and limits

Precision and recall are measured only against Evergreen's documented v0.1 rule set and the pinned corpus. They do not mean Evergreen detects every possible deprecation in these ecosystems. The corpus is public and reproducible, but not a statistically representative sample of all software. Dynamic action references and unsupported ecosystems remain intentionally unclassified.

The controlled source-usage benchmark provides a separate exact-match test for imports, calls, and configuration keys; see [Benchmarks](BENCHMARKS.md).
