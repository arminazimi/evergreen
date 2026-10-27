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
