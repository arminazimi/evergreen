# Comparison with Dependabot

The measured comparison of Evergreen with [Dependabot](https://docs.github.com/en/code-security/dependabot),
run under [docs/COMPARISON_METHOD.md](../../../docs/COMPARISON_METHOD.md). The method was published before any
result existed ([#2172](https://github.com/arminazimi/evergreen/issues/2172)); this directory holds the run
([#2174](https://github.com/arminazimi/evergreen/issues/2174)).

**Dependabot was not run.** The method's section 7 records that Dependabot runs inside GitHub's service against a
repository's default branch, not against a pinned commit, and this repository has no runner for it. Every number here
therefore measures one side only: the update surface a repository's committed `dependabot.yml` declares, checked
against Evergreen's findings on the same pinned checkout. It is not a head-to-head result, and no finding here was
reported by Dependabot.

| File | What it is |
| --- | --- |
| [raw/](raw/) | One record per repository: Evergreen's findings, the Dependabot update entry the bridge maps each finding to, and the repository's committed `dependabot.yml` entries. Written by `collect.ts`; never edited by hand. |
| [dependabot.json](dependabot.json) | The aggregated result. Generated. |
| [dependabot.md](dependabot.md) | The tables, including every repository that commits a config, with the file linked at the pinned commit. Generated. |

## What was run

* **Repositories:** the subset fixed in the method (section 4): every `blind` repository of the pinned corpus
  (`benchmarks/public-repositories/`) plus the five repositories that already have a committed differential report.
  Those five are `targeted`. Blind and targeted are reported as separate rows and never added together. The corpus has
  grown since the Renovate run, so this run's repository list is larger; both apply the same rule at different times.
* **Checkouts:** the corpus cache, at each entry's pinned commit. Repositories are only read, never executed.
* **Evergreen:** `scanRepository` with every built-in detector, offline, no narrowing.
* **Dependabot:** not run. The record stores `run: "not-run"` beside the configuration it did read, so the absence is
  part of the data rather than an omission a reader has to notice.
* **Dependabot configuration:** the first `.github/dependabot.yml` or `.github/dependabot.yaml` in the checkout,
  parsed as YAML. Nothing in the file is evaluated.

## The measures

Each finding gets one standing against the repository's committed configuration:

* **Covered** — the configuration declares the same `package-ecosystem` and a directory containing the finding, in an
  entry with no `ignore` or `allow` list. The dependency is inside the surface the repository asked Dependabot to
  watch. This does **not** mean Dependabot reported the finding: it means the package and directory are visible to it.
* **Uncovered** — the bridge maps the finding to a Dependabot `package-ecosystem`, but no declared entry watches that
  ecosystem at that directory. The result splits this by whether the repository commits a Dependabot configuration at
  all, because "Dependabot is not configured here" and "Dependabot is configured, but not for this part of the tree"
  are different facts.
* **Filtered** — a matching entry declares `ignore` or `allow`. Those dependency-level filters are not evaluated, so the
  finding is counted neither as covered nor as uncovered. The report counts the entries too.
* **No Dependabot update entry** — the bridge has no `package-ecosystem` for the finding. Runtime end-of-life, retired
  APIs, workflow-command removals, host-image policies, and Dockerfile syntax are examples. No configuration change
  could put them in a Dependabot update entry. The mapping is Evergreen's bridge, not Dependabot's own ecosystem list:
  a missing mapping lands in this bucket even when GitHub supports the ecosystem.

A finding's Dependabot target is the `updates` entry `buildDependabotUpdates` produces for it, evaluated against every
rule in `registry/*.json`, and is recorded in the raw file. The `evergreen dependabot-config` command passes
`bundledRules()` — the four registries `check` resolves — so its printed fragment is narrower than this measure. That
difference is a property of the command's rule list, not of Dependabot, and changing it is outside this issue.

## Reading the result

* **This is not agreement.** Dependabot answers "is there a newer version, or a known advisory?". Evergreen answers
  "is this line still supported?". A covered finding is at most a place where both tools can see the same dependency.
* **No finding is a miss of the other tool.** Uncovered findings are not Dependabot misses, and covered findings are
  not evidence that Dependabot would report them. Dependabot's automation, advisory database, and native pull requests
  are capabilities Evergreen does not have and does not score.
* **Configuration is not behavior.** A declared entry may fail to update anything (no newer version, a failing
  ecosystem, a branch protection rule). This run reads the declaration, not GitHub's job history.
* **Blind and targeted are never added together**, matching the method.

## Reproduce

Collecting needs the corpus cache and no network. Rebuilding the tables reads only committed files.

```bash
npm ci
npm run build
export EVERGREEN_CORPUS_CACHE=~/.cache/evergreen-corpus
npm run corpus:warm
node dist/benchmarks/comparison/dependabot/collect.js          # write raw/<owner>__<name>.json
node dist/benchmarks/comparison/dependabot/build.js            # rewrite dependabot.json and dependabot.md
node dist/benchmarks/comparison/dependabot/build.js --check    # exit 1 when either committed file is stale
```

`collect.js` skips repositories that already have a raw file; pass `--force` to redo them and `--only owner/name` to
run one. `build.js` reads only committed files: no network, no repository code, no clock, and `npm run check` tests it.

## Limits

* **Dependabot is not measured.** No run exists against a pinned commit; the method's section 7 states this before any
  result and this page does not substitute configuration for a run.
* **Dependency-level filters are not evaluated.** Entries with `ignore` or `allow` are counted as filtered, not as
  covered, and the raw file records the two flags. A rule inside an `ignore` list could still be a real gap.
* **The no-entry bucket follows the bridge's mapping.** A package ecosystem GitHub supports but
  `buildDependabotUpdates` does not map (for example Hex) would be counted as having no entry. Each raw file records
  the mapping decision, so widening the map is a new run, not a silent re-score.
* **Glob directories use Dependabot's documented `*` and `**` forms.** `?` is treated as one non-separator character.
  A pattern outside that grammar is matched literally.
* **Only the first configuration file is read**, `.github/dependabot.yml` before `.github/dependabot.yaml`. A
  repository that commits both has one file unmeasured; Dependabot's own precedence is not re-derived here.
* **The pinned commit is assumed to be the default branch** Dependabot would run on. The method pins commits; GitHub
  runs Dependabot on a branch. The two are the same for these entries as recorded, and this run cannot prove it.
* **No alerts, advisories, or update jobs are read.** The result says what the configuration watches, not what GitHub
  found or opened.
* **One run with one Evergreen commit and one corpus.** The raw records hold the Evergreen commit and the bridge target
  each finding received, so a later registry edit does not silently re-score an old run.
* **The corpus is as it stood at the commit under test.** The blind half has grown since the method page counted it.
