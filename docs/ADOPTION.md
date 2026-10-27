# Measuring adoption

Evergreen has no telemetry and never will: a scan does not phone home, and nothing about how people use it is collected. Adoption is measured only from public data that anyone can look up, so every number can be reproduced and none of it comes from users.

## The north-star metric

**Public repositories that run Evergreen in their own automation.** That is the sum of three counts of distinct repositories, found through GitHub code search:

| Metric | What it counts |
| --- | --- |
| `githubActionRepositories` | Repositories whose `.github/workflows` use `arminazimi/evergreen@…` |
| `preCommitRepositories` | Repositories whose `.pre-commit-config.yaml` lists the Evergreen hook |
| `gitlabComponentRepositories` | Repositories whose `.gitlab-ci.yml` references Evergreen |

Repositories owned by the project (`arminazimi/*`) are left out, so dogfooding does not inflate the number. The three counts are reported separately and may overlap when one repository uses more than one integration; add them as an upper bound and compare them as a trend, not as a precise population.

## Supporting signals

| Metric | Source |
| --- | --- |
| `npmWeeklyDownloads` | npm's public download API, last week, package `evergreen-deprecation` |
| `mcpRegistryListed` | Whether the official MCP Registry has an entry whose repository is `arminazimi/evergreen` |
| `skillsShInstalls` | The install count published on the skills.sh page of the Evergreen skill |
| `githubStars`, `githubForks` | The GitHub repository |

npm downloads include CI installs and mirrors, so they overstate unique users; the skills.sh figure only counts installs through that registry.

## Taking a snapshot

A maintainer runs the tool, about once a week:

```bash
npm run metrics:adoption
```

It needs the network and a GitHub token in `GITHUB_TOKEN` or `GH_TOKEN` (code search is not available anonymously) and writes `metrics/adoption/<date>.json`. Commit the file. The tool is never part of a scan, of `npm run check`, or of pull-request CI.

Each metric is either `ok` with a `value` and its `source`, or `unavailable` with a `reason`; one failing source never stops the others. A `detail` of `lower bound` means GitHub returned fewer matching files than it reported (code search returns at most 1,000 results) or rate-limited the run, so the true number is at least the one shown. An unpublished package is `unavailable` rather than zero.

## Reading the trend

Compare snapshots of the same metric over time. A change in code-search coverage on GitHub's side can move a number without any change in adoption, so look for movement across several weeks, and never mix an `unavailable` week into a trend as if it were zero.

The first snapshot is `metrics/adoption/2026-10-16.json`. At that date the package was not yet published on npm, and no public repository outside the project used the Action.

## Scanning this repository

The `self-scan` job in `.github/workflows/ci.yml` builds the code under test (not a published release), then runs `evergreen scan . --baseline .evergreen-baseline.json`. The job fails on any finding the baseline does not cover, so a new deprecated dependency, runtime, or Action blocks a merge like any other defect. The scan uses no network.

To accept a finding a maintainer has reviewed:

```bash
npm run build
node dist/src/cli.js baseline . --output .evergreen-baseline.json
```

Review the diff, then edit each new entry to add an `owner`, a `reason`, and an `expires` date (see [GITHUB_ACTION.md](GITHUB_ACTION.md) for the baseline format), and commit the file in the same pull request as the change that introduced the finding. Prefer fixing the finding; every accepted one should have a dated reason. Findings the scan gets wrong are product feedback: open an issue labelled `dogfood`.

## Triaging self-scan findings

Every finding the self-scan produces is product feedback, so each one is triaged before it is accepted or fixed:

| Outcome | Meaning | What to do |
| --- | --- | --- |
| False positive | The finding is wrong | Open an issue labelled `dogfood` for the detector or rule, with the finding ID and the evidence; fix the product, not the baseline |
| Missing rule | The scan misses a lifecycle risk we know about | Open an issue labelled `dogfood` asking for the rule, with an authoritative source |
| Real debt | The finding is right | Fix it, or accept it in `.evergreen-baseline.json` with an owner, reason, and expiry, and open an issue labelled `dogfood` to track it |

The `dogfood` label is defined in `.github/labels.yml`. Apply it to every issue that came from the self-scan, whatever the outcome.

## Monthly self-scan report

Once a month a maintainer adds `reports/self-scan-YYYY-MM.md` using the template in [reports/README.md](../reports/README.md): the counts from a scan of `main` and the outcome of each finding triaged that month. The numbers are reproducible with `node dist/src/cli.js scan . --json` on the commit the report names. Like the adoption snapshot, the report is committed; nothing about it is collected from users.

## Routing findings to owners

`evergreen scan --by-owner` groups a scan's findings by the owners in the repository's `CODEOWNERS` file (`.github/CODEOWNERS`, `CODEOWNERS`, or `docs/CODEOWNERS`, first one found), so each team sees only what it owns. It reads that file and nothing else; no network is used.

```bash
node dist/src/cli.js scan . --by-owner --json
```

The last matching rule wins, as on GitHub. A finding in a file with no owner, or covered by a rule that lists none, goes under `unowned` (`Unowned` in text output); when there is no CODEOWNERS file every finding is listed there. A file with several owners appears under each. The JSON (`evergreen.owners.v1`) lists `owners` largest first with ties broken by name, then `unowned`. Section headers (`[Section]`) in CODEOWNERS are ignored, and `--by-owner` supports text and JSON output only.

## Rolling up many repositories

A platform team can merge saved scan reports from many repositories into one summary. Each repository writes its report with `evergreen scan --json > reports/<repository>.json`; the rollup then reads those files and nothing else, so it uses no network and does not touch the repositories.

```bash
node dist/src/cli.js rollup reports/*.json --owners owners.json --json
```

- **Repository** is the report file's name without its extension, so `reports/payments.json` is `payments`.
- **Product** is the part of a finding's rule ID before the first dot: `nodejs.runtime.eol-18` counts under `nodejs`.
- **Owner** comes from the optional `owners.json`, a JSON object such as `{ "payments": "platform-team" }`. A repository it does not list is grouped under `unowned`.

The result (`evergreen.rollup.v1`) gives total findings and severities, then groups by product and by owner, largest first with ties broken by name. Each group lists its findings by severity and the repositories they come from. The same reports always produce the same output, whatever order the files are given in.

## Feeding Renovate

When a repository already runs Renovate, Evergreen can print a preset of `packageRules` for the replacements and runtime pins it found in that repository. The command writes JSON to stdout only; it never edits `renovate.json` or any other file.

```bash
node dist/src/cli.js renovate-preset .
```

- **Package replacements** become rules with `matchDatasources`, `matchPackageNames`, and `replacementName` when the finding's replacement is itself a package name (for example `node-sass` → `sass`). Prose replacements are skipped.
- **Runtime pins** become `allowedVersions` rules for Node.js (`node-version` / `node`) and Python (`docker` / `python`) so Renovate stays on a supported release line.
- Validate the printed JSON with Renovate before merging it into config: `npx --yes --package renovate -- renovate-config-validator path/to/preset.json`.

## Socket report for 0.7.1

Socket scans the published version, so the 0.7.1 release (2026-10-27) is the first one whose report reflects the tarball fix from #1350 and the trimmed WASM from #1352. Its score page shows Vulnerability 100, Quality 100, License 100, Maintenance 94, and Supply Chain Security 79. Socket lists no CVE alert and no deprecation alert for the package or its dependencies. Five package alerts remain, and each is expected:

| Alert | Category | Why it is expected |
|---|---|---|
| Unpopular package | Quality | Socket scores download counts, and a young package has few. The alert clears as adoption grows. |
| Debug access | Supply chain risk | The vendored tree-sitter runtime (`src/usage/vendor/tree-sitter/tree-sitter.cjs`) is an Emscripten build that uses dynamic code evaluation to load its WebAssembly. It parses source files and runs nothing from the scanned repository. |
| Environment variable access | Supply chain risk | The CLI reads proxy settings, `EVERGREEN_DATA_URL`, the state and usage-log locations, `EDITOR`, and `GITHUB_TOKEN` or `GH_TOKEN` for the opt-in commands that need them. A scan reads none of them to decide a finding. |
| Filesystem access | Supply chain risk | Evergreen's job is reading a repository's manifests, lockfiles, and workflows, and it writes only the files the user asks for, such as a report or `--fix` output. |
| URL strings | Supply chain risk | The package contains the lifecycle data and importer source URLs, and the default signed-data release URL used by `evergreen data update`. Scans use no network; only `data update` and the explicit importer commands do. |

Revisit this table at each release. A new alert, or any CVE or deprecation alert, is a defect to fix before the next release rather than an item to add here.

## Service scores, reviewed 2026-10-27

The package metadata itself has nothing to fix: the repository, homepage, bug tracker, keywords, license, and engines field all resolve the same way on Snyk and deps.dev, so the low-effort items this review looked for were metadata defects and none were found. What each service currently says about `evergreen-deprecation@0.7.1`:

| Service | Score | Top reasons |
| --- | --- | --- |
| OpenSSF Scorecard | 3.1 (run of 2026-10-27, published from `main` at 5bc33d0 by [scorecard.yml](../.github/workflows/scorecard.yml)) | The five low checks are the actionable part; the accepted gaps (Branch-Protection, SAST) are documented in [SECURITY.md](SECURITY.md). |
| deps.dev | no score | The project page for `github.com/arminazimi/evergreen` does not exist yet, so the UI shows no Scorecard or project metrics. The version record itself is complete: 0.7.1 resolves with no OSV advisories, license `Apache-2.0`, and SLSA provenance that verifies against the GitHub source. |
| npms.io | not indexed | The package does not appear in the index, and there is no metadata defect on our side: the index has not analyzed the modules it holds since the end of 2022 (its entry for `zod` was last analyzed 2022-12-13), so packages published in October 2026 do not get scores. Treat npms.io as unavailable until its crawler resumes. |
| Snyk Advisor | retired | Every Snyk Advisor URL now redirects to the `security.snyk.io` package page, which publishes no health score. That page reports no direct vulnerabilities in Snyk's database for any of the eleven published versions. |

The Scorecard checks that are lowest and what they would need:

| Check | Score | Why, and what closes it |
| --- | --- | --- |
| Pinned-Dependencies | −1 (error) | Scorecard's Dockerfile parser reports the multi-stage Dockerfile as invalid, so the check errors instead of scoring. Tracked in #1375. |
| Branch-Protection | −1 (error) | The check cannot read admin-only branch-protection rules without a token the workflow does not hold; accepted in [SECURITY.md](SECURITY.md), not a defect. |
| Maintained | 0 | The repository is newer than 90 days at the time of the run; this lifts itself as the repository ages and no action is needed. |
| Code-Review | 0 | Approving reviews are deliberately not a merge gate so agent pull requests can merge after green checks; a policy choice, not a defect. |
| Dependency-Update-Tool | 0 | No Dependabot or Renovate configuration exists. Tracked in #1374. |
| SAST | 0 | No separate CodeQL analysis runs today; accepted in [SECURITY.md](SECURITY.md). Tracked in #1377. |
| Signed-Releases | 2 | Only the npm attestations are signed; the last four GitHub release artifacts are not. Tracked in #1376. |

Security-Policy, Token-Permissions, License, Packaging, and CI-Tests all score 10. Revisit this review on the same cadence as the Socket table: at each release. Scan findings never use these services, so none of this affects a scan; it is adoption and trust context only.
