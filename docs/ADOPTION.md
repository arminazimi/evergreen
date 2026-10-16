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
