# Comparison with Renovate

The measured comparison of Evergreen with [Renovate](https://docs.renovatebot.com), run under
[docs/COMPARISON_METHOD.md](../../../docs/COMPARISON_METHOD.md). The method was published before any result existed
([#2172](https://github.com/arminazimi/evergreen/issues/2172)); this directory holds the run
([#2173](https://github.com/arminazimi/evergreen/issues/2173)).

| File | What it is |
| --- | --- |
| [raw/](raw/) | One record per repository: Evergreen's findings, Renovate's dependencies in the three comparable families, and the wall-clock time of each tool. Written by `collect.ts`; never edited by hand. |
| [renovate.json](renovate.json) | The aggregated result. Generated. |
| [renovate.md](renovate.md) | The tables, with every disagreement as its own row linked to the declaration at the pinned commit. Generated. |

## What was run

* **Repositories:** the subset fixed in the method (section 4): every `blind` repository of the pinned corpus
  (`benchmarks/public-repositories/`) plus the five repositories that already have a committed differential report.
  Those five are `targeted`. Blind and targeted are reported as separate rows and never added together. The blind half
  has grown since the method page counted it; the run used the corpus as it stood at the commit under test.
* **Checkouts:** the corpus cache, at each entry's pinned commit. Repositories are only read.
* **Evergreen:** `scanRepository` with every built-in detector, offline, no narrowing, from the commit recorded in each raw file.
* **Renovate:** `--platform=local --dry-run=lookup --report-type=file`, with a read-only GitHub token so GitHub Actions
  resolve (method, section 6). Renovate's own configuration discovery applied, so a repository's `renovate.json` was honoured.
* **Comparison:** the existing harness, [`benchmarks/differential/renovate.ts`](../../differential/renovate.ts), unchanged.

## Reading the result

* **Comparable families only.** Renovate has no lifecycle data. A pair is counted where both tools can speak about the same
  dependency in the same file: deprecated npm packages, base images, and GitHub Actions. Everything else (runtimes, retired APIs,
  and so on) is listed as not comparable. It is neither a win nor a miss.
* **`agree` is weaker than it sounds for images and Actions.** Evergreen says the line is past its vendor's end of life;
  Renovate says a newer version exists. They agree that the dependency should move, not on why.
* **`evergreen-only` and `renovate-only` are misses of the other tool.** `renovate-only` is a deprecation notice Evergreen has
  no rule for. Each row is an observation, not evidence for a new rule.
* **Spelling mismatches inflate `evergreen-only`.** The harness reads the package name from the rule id, so a version-line rule
  such as `next.13` or a scoped `@types/x` can fail to match the Renovate name of the same package
  ([differential-testing.md](../../../docs/validation/differential-testing.md) records the same limit). Read those rows before counting them as misses.
* **`inconclusive`** means Renovate skipped the lookup (for example a rate limit). It is excluded from both sides and counted.
* **Renovate runs that did not finish** (failure or the 10-minute limit) are listed by name and contribute no comparison.
* **Time** is wall clock on one machine with the concurrency shown. It is a reference point, not a performance guarantee, and the
  tools do different work. It is never compared across machines.

## Reproduce

Renovate needs the network and Node.js 24. This is a maintainer action, not part of `npm run check`.

```bash
npm ci
npm run build
export EVERGREEN_CORPUS_CACHE=~/.cache/evergreen-corpus
npm run corpus:warm
export RENOVATE_TOKEN=<read-only token> GITHUB_COM_TOKEN=<read-only token>
node dist/benchmarks/comparison/renovate/collect.js --renovate <path to renovate/dist/renovate.js> [--node <node 24>] [--concurrency 4]
node dist/benchmarks/comparison/renovate/build.js            # rewrite renovate.json and renovate.md
node dist/benchmarks/comparison/renovate/build.js --check    # exit 1 when either committed file is stale
```

`collect.js` skips repositories that already have a raw file; pass `--force` to redo them and `--only owner/name` to run one.
`build.js` reads only committed files: no network, no repository code, no clock, and `npm run check` tests it.

## Limits

* One run on one day with one Renovate version. A later Renovate or registry change does not alter these files until the run is repeated.
* Dependabot is not measured, as the method states: it has no pinned-commit runner.
* Renovate's automation (opening update pull requests) is a capability Evergreen does not have; it is not scored.
* The Evergreen commit recorded in each raw file is the base commit the run executed from; the collector and aggregator were
  added on top of it and do not change what Evergreen reports.
