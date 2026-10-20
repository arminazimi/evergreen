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

## Kubernetes corpus

Five public repositories at pinned commits cover the `kubernetes` detector: `argoproj/argocd-example-apps` (Helm and kustomize applications, no findings), `kelseyhightower/ingress-with-static-ip`, `unixhot/salt-kubebin` (a CronJob and three Ingresses), `kubernetes/examples` (two PodSecurityPolicy documents, plus the two end-of-life base images the container detector reports there), and `lusyoe/springboot-k8s-example` (a Helm template and a plain manifest).

Because the corpus scans every detector, every finding in these repositories is recorded, not only the Kubernetes ones. Each expected finding was checked by reading its line at the pinned commit, and its `groundTruthSource` is a `maintainer-review` note naming the path and line; none of these repositories has a migration commit for the finding, so none is cited. The rules' dates and removal releases come from the Kubernetes migration guide, not from these repositories. A full run on 2026-10-17 over all 74 corpus entries (including the Java entries added in the next change) reported no false positives or false negatives, with nine expected `kubernetes` findings, all true.

## Java and Kotlin corpus

Five public repositories at pinned commits cover the `java` detector: `kagkarlsson/db-scheduler` (a multi-module Maven build, no findings), `piomin/sample-spring-reactive` (a `java.version` of 19), `danvega/loom` (`java.version`, `source`, and `target` of 19), `krakowski/jextract-demo` (a Gradle Kotlin DSL toolchain of 22), and `Descended/Henesys` (a `mysql:mysql-connector-java` 8.0.33 dependency, which the artifact's own POM relocates).

Every finding in these repositories is recorded, not only the Java ones, and each was checked by reading its line at the pinned commit. The ground truth is a `maintainer-review` note naming the path and line; none of the repositories has a migration commit for the finding. The JDK dates come from the Oracle Java SE Support Roadmap and the Temurin support page, and the relocation from the Maven Central POM, not from these repositories. A full run on 2026-10-17 over the 74 corpus entries then in the file reported no false positives or false negatives, with six expected `java` findings, all true.

## Ruby corpus

Five public repositories at pinned commits cover the `ruby` detector: `rack/rack` (no findings), `Shopify/packwerk` (`.ruby-version` 3.0.4, plus three `actions/checkout@v2` pins), `thoughtbot/suspenders` (`.ruby-version` 3.2.2, plus one `actions/checkout@v4` pin), `github/view_component` (`.ruby-version` 2.7.1), and `puma/puma` (a Gemfile `ruby "3.2.0"` directive in a local benchmark).

Because the corpus scans every detector, every finding in these repositories is recorded, not only the Ruby ones. Each expected finding was checked by reading its line at the pinned commit, and its `groundTruthSource` is a `maintainer-review` note naming the path and line; none of these repositories has a reviewed migration entry in the mining log for the finding, so none is cited as `migration-commit`. The EOL dates come from the [Ruby maintenance branches](https://www.ruby-lang.org/en/downloads/branches/) page, not from these repositories.

## PHP corpus

Five public repositories at pinned commits cover the `php` detector: `laravel/laravel` (a current Laravel application skeleton, no findings), `jobbyphp/jobby` (`swiftmailer/swiftmailer`), `ZF-Commons/ZfcUser` (`zendframework/zend-stdlib`), `MacPaw/behat-orm-context` (`config.platform.php` 7.4.33, plus `actions/checkout@v4` and `actions/cache@v4` pins), and `Kalpa-Services/mmg-wp-plugin` (`config.platform.php` 7.4, plus `actions/checkout@v4`, `actions/github-script@v6`, and `actions/setup-go@v4` pins).

Because the corpus scans every detector, every finding in these repositories is recorded, not only the PHP ones. Each expected finding was checked by reading its line at the pinned commit, and its `groundTruthSource` is a `maintainer-review` note naming the path and line; none of these repositories has a reviewed migration entry in the mining log for the finding, so none is cited as `migration-commit`. Package abandonment comes from Packagist and the Laminas / Symfony announcements; the PHP 7.4 end-of-life date comes from the [PHP unsupported branches](https://www.php.net/supported-versions.php) page, not from these repositories.

## Swift corpus

Five public repositories at pinned commits cover the `swift` detector: `seedco/Formalist` (`.xcode-version` 9.3.1), `bojan/Troop` (`.xcode-version` 10.2.1), `s2mr/xc` (`.xcode-version` 14.2.0), `s2mr/L10nLint` (`.xcode-version` 16.4.0), and `Simperium/simperium-ios` (`.xcode-version` 26.6, no findings).

Because the corpus scans every detector, every finding in these repositories is recorded, not only the Swift ones. Each expected finding was checked by reading its line at the pinned commit, and its `groundTruthSource` is a `maintainer-review` note naming the path and line; none of these repositories has a reviewed migration entry in the mining log for the finding, so none is cited as `migration-commit`. The Xcode acceptance dates come from [App Store upcoming requirements](https://developer.apple.com/news/upcoming-requirements/), not from these repositories.

## .NET blind selection

The six earliest .NET repositories were chosen knowing their result, so each records `selection: "targeted"`. The `selection` field is optional on every corpus entry; `"blind"` means the repository was chosen by a rule fixed before Evergreen ran on it ([decision 0013](decisions/0013-detector-maturity.md)), and an entry without the field counts as not blind.

The blind rule, run on 2026-10-19: GitHub repository search for `language:C#`, 100 to 500 stars, last pushed from 2021-01-01 to 2024-12-31, not a fork, not archived, sorted by stars descending (`gh search repos --language "C#" --stars "100..500" --updated "2021-01-01..2024-12-31" --archived=false --include-forks=false --sort stars --order desc`). Walk the results in order and take each repository whose default branch has at least one `*.csproj`, `*.fsproj`, `*.vbproj`, or `global.json`; skip the others (Unity packages with no project file). Stop at twelve, whatever Evergreen reports for them. The twelve, pinned at their default-branch commit on that date, are results 1, 3, 5, 7, 9, 10, 11, 12, 13, 14, 15, and 16 of that search: rikimaru0345/Ceras, takuya-takeuchi/DlibDotNet, 0xthirteen/SharpStay, NightfallGT/Mercurial-Grabber, Dec0ne/ShadowSpray, Ceiridge/Chrome-Developer-Mode-Extension-Warning-Patcher, TerribleDev/OwinOAuthProviders, chsakell/mvcarchitecture, SeriaWei/ASP.NET-MVC-CMS, stanzhai/Html2Article, BeichenDream/SharpToken, and nettitude/SharpSocks. Ranks 2, 4, 6, and 8 have no project file. The query returns different results on another day, so the pinned list above, not a re-run, is the record.

Ground truth: for each repository the target frameworks, SDK pins, and package references were listed by `grep` over the pinned files and compared with the report, independently of Evergreen's own output. Every expected finding has a `maintainer-review` note naming the path, the exact line, and the vendor date the rule rests on. Ceras was the one miss: it targets `netcoreapp2.1` and `netcoreapp2.2`, which had no rule, so the registry gained the 1.x, 2.x, and 3.0 lines in the same change.

## Precision thresholds

[`benchmarks/thresholds.json`](../benchmarks/thresholds.json) sets a precision floor per detector (`github-actions`, `nodejs`, `npm`, `python`, and `dotnet` at `beta`; a detector is named by the first segment of its rule ids). The harness scores each detector, prints the figures under `detectors` in its JSON, and reports `thresholdViolations`. A stable detector below its `minPrecision` (0.95 today) fails the run with a line such as:

```text
THRESHOLD  npm: precision 0.9 is below the required 0.95
```

The weekly corpus workflow therefore fails on a precision regression even if the exact-match comparison is later relaxed. Mark a new detector `"stable": false` until its corpus coverage is meaningful; it is still scored and reported but never fails the run. Never lower a floor to make a run pass.

## Fetching and the checkout cache

The harness fetches up to six repositories at once; change that with `--concurrency <n>` or `EVERGREEN_CORPUS_CONCURRENCY`. Scans and the report stay in corpus order.

Every corpus commit is pinned, so a checkout never changes. Set `EVERGREEN_CORPUS_CACHE=<dir>` (for example `~/.cache/evergreen-corpus`) to keep each one on disk as `<owner>__<repo>@<commit>` and skip the network when it is already there. Entries are written to a temporary directory and renamed into place, and `.git` is removed because scans read files only, so an interrupted run never leaves a half-filled entry. Unset, there is no cache and a run behaves as before. A warm run reports the same true positives, false positives, false negatives, and findings as a cold one.

## Running a subset

```bash
npm run validate:public-repos -- --ecosystem php
npm run validate:public-repos -- --ecosystem php --ecosystem ruby
npm run validate:public-repos -- --repo laravel/framework
```

`--ecosystem <name>` and `--repo <owner/name>` are repeatable; naming both selects the union, reported in corpus order. An unknown name is an error that lists the valid ones. A filtered run still fails on any false positive or false negative among the entries it covers, but it is not a full run: it does not enforce the per-detector precision floors, it writes no `lastFullRun`, the JSON report says `"fullRun": false` with a `filter` line, and the run prints `FILTERED RUN` on stderr. Only an unfiltered run can be recorded or compared with the full-corpus claims in this document.

### Re-running only what failed

After fixing a detector, re-check just the repositories that had a mismatch:

```bash
npm run validate:public-repos -- --output corpus-result.json     # a run with UNEXPECTED or MISSING lines
npm run validate:public-repos -- --failed-from corpus-result.json
```

`--failed-from <report.json>` runs the repositories whose entry in that report has an `unexpected` or `missing` finding; any that have left the corpus are skipped. It is a filtered run like the others (`FILTERED RUN` on stderr, `"fullRun": false`) and never counts as a full run. A report with no mismatches prints that and exits 0 without fetching anything.

### Comparing with an earlier run

```bash
npm run validate:public-repos -- --compare corpus-result.json
npm run validate:public-repos -- --compare benchmarks/thresholds.json
```

`--compare <file>` prints what moved since that file. Against an earlier report it lists `ADDED` and `REMOVED` findings per repository and the per-detector true-positive, false-positive, and false-negative differences (`DELTA`), computed over the repositories present in both, so a filtered run compares like with like. Against `benchmarks/thresholds.json` it uses the recorded `lastFullRun` for the per-detector numbers only. Comparing never changes the exit code: false positives, false negatives, and the precision floors still decide it, and an unreadable comparison file is reported without failing the run.

## Run cost and budget

Every report carries a `cost` block: total wall time, the summed fetch time (larger than the wall time when fetches overlap), cache hits and misses, and the size of the git data fetched (git does not expose network bytes, so this is the `.git` size of each fetched checkout). The run prints it as a `COST` line, and the weekly workflow shows it in the job summary.

`benchmarks/thresholds.json` holds the `budget`: a wall-time limit in seconds and a fetched-bytes limit. Going over either prints a `BUDGET` warning (a `::warning::` annotation in Actions), lists it in the report's `budgetWarnings`, and flags it in the job summary. A budget overrun never fails the run; correctness is decided by false positives, false negatives, and the precision floors alone. Tighten the budget in a pull request when a faster fetch strategy lands, and raise it only with a stated reason.

## Stalled fetches

One hung connection must not hold a run. Each fetch passes git's low-speed abort (`http.lowSpeedLimit=1000`, `http.lowSpeedTime=30`: below 1 KB/s for 30 s) and a hard limit of 120 s per attempt, changed with `EVERGREEN_CORPUS_FETCH_TIMEOUT_SECONDS`. A stall counts as a failed attempt, so it is retried and, when every attempt fails, reported with the repository name. At the end of every run the five slowest fetches print as `SLOWEST` lines.

## Reading a run

By default a run prints a short table on stdout instead of the full JSON: true positives, false positives, false negatives, and precision per ecosystem and per detector, then every `UNEXPECTED` and `MISSING` line, then a one-line wall-time summary. Progress goes to stderr as one line per fetched repository (`12/107 owner/name 2.1s`). The `COST`, `SLOWEST`, and `BUDGET` lines follow on stderr.

```bash
npm run validate:public-repos -- --output corpus-result.json   # table on screen, full JSON in the file
npm run validate:public-repos -- --json > corpus-result.json   # JSON on stdout; the table moves to stderr
```

`--output <file>` writes the full JSON report whatever the result, so a failing run still leaves it behind. The weekly workflow uses `--output` and uploads that file as the `corpus-result-<run id>` artifact.

## Weekly run and refreshing pins

Pull request CI never touches the network, so the corpus is checked by [`.github/workflows/corpus.yml`](../.github/workflows/corpus.yml) every Monday and on demand (Actions → Public corpus → Run workflow). The result is uploaded as the `corpus-result-<run id>` artifact even when the comparison fails. A failing run prints one line per mismatch, for example:

```text
UNEXPECTED owner/repo@4ec1ebe0fa: github-actions.setup-node.node20:.github/workflows/ci.yml:20
MISSING    owner/repo@4ec1ebe0fa: nodejs.runtime.eol-18:package.json:83
```

`UNEXPECTED` means Evergreen reported a finding the corpus does not list; `MISSING` means a listed finding was not reported. Because every commit is pinned, a mismatch means Evergreen's rules or detectors changed, not the repository. Decide which side is right before touching the corpus: fix the detector or rule when the corpus is right, and update the expected entry (with its `groundTruthSource`) only when the new result is correct.

To move an entry to a newer commit, change its `commit` to the full 40-character SHA, run `npm run observe:public-repos` to list what Evergreen now reports, review every difference against the repository at that commit, update `expected`, and run `npm run validate:public-repos` until it passes. Never refresh a pin only to make a failing run green.

## Differential testing against Renovate

Renovate is the closest widely used tool, so the report compares Evergreen's findings with Renovate's for the same repository, by rule family. A maintainer runs Renovate (it needs the network and a large download; it is not part of `npm run check` or any scan):

```bash
npx renovate --platform=local --dry-run=lookup --report-type=file --report-path=renovate.json
npm run differential:renovate -- --renovate renovate.json --repository . --name owner/repo --out report.json
```

The two tools answer different questions. Renovate says a newer version exists and prints npm deprecation notices; it has no end-of-life data. Evergreen says a release line is past its vendor's end of life; it does not say an update exists. So the report only compares where both can speak about one dependency in one file:

| Family | Evergreen | Renovate | Counted as agreement |
| --- | --- | --- | --- |
| `deprecated-package` | `npm.package.*` findings | npm `deprecationMessage` | both mark the package deprecated |
| `base-image` | `container.*` findings | `dockerfile` / `docker-compose` updates | Renovate offers an update for the image Evergreen calls end-of-life |
| `github-action` | `github-actions.*` findings | `github-actions` updates | Renovate offers an update for the action Evergreen flags |

Outcomes: `agree`, `evergreen-only`, `renovate-only`, and `inconclusive` (Renovate skipped the lookup, for example `github-token-required` for Actions when run without a GitHub token, so it says nothing either way). Runtime findings (`nodejs.runtime.*`, `python.runtime.*`) have no Renovate counterpart and are listed as not comparable. Matching is by file and dependency name because Renovate gives no line numbers.

Results for the five container corpus repositories, with Renovate 44.164 run without a GitHub token on 2026-10-16 (reports in [`benchmarks/differential/reports/`](../benchmarks/differential/reports/), trimmed Renovate output in `tests/fixtures/differential/`):

| Repository | Agree | Evergreen-only | Renovate-only | Inconclusive |
| --- | --- | --- | --- | --- |
| outline/outline | 2 | 0 | 17 | 15 |
| excalidraw/excalidraw | 3 | 0 | 2 | 20 |
| mealie-recipes/mealie | 3 | 0 | 4 | 14 |
| umami-software/umami | 2 | 0 | 2 | 4 |
| gethomepage/homepage | 0 | 0 | 0 | 0 |

What it shows:

- **Agreements** are all base images: where Evergreen calls `node` or `postgres` end-of-life, Renovate offers a major update. Renovate does not say the old line is unsupported; only Evergreen does.
- **Renovate-only** are npm deprecations Evergreen has no rule for (for example `@types/*` stubs, `babel-eslint`, `koa-router`, `socket.io-redis`, `react-beautiful-dnd`, `rollup-plugin-terser`, `@nuxt/types`). This is the real gap: the `npm-deprecated` importer only checks a candidate list, so these names are candidates to add. Each is a Renovate observation, not evidence; the importer still requires the registry's own deprecation notice.
- **Evergreen-only** is empty here; every Evergreen finding that Renovate could look up, it also had an update for.
- Most GitHub Action findings are `inconclusive` because Renovate cannot look up Actions without a token. Re-run with `RENOVATE_TOKEN` to turn them into comparisons.

## Interpretation and limits

Precision and recall are measured only against Evergreen's documented v0.1 rule set and the pinned corpus. They do not mean Evergreen detects every possible deprecation in these ecosystems. The corpus is public and reproducible, but not a statistically representative sample of all software. Dynamic action references and unsupported ecosystems remain intentionally unclassified.

The controlled source-usage benchmark provides a separate exact-match test for imports, calls, and configuration keys; see [Benchmarks](BENCHMARKS.md).
