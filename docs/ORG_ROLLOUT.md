# Organization rollout

Evergreen ships a reusable workflow, [`.github/workflows/org-scan.yml`](../.github/workflows/org-scan.yml), that one repository in an organization calls to scan every repository in the same organization. It lists the organization's repositories with a read-only token, scans each one in a matrix with bounded concurrency through the first-party Evergreen Action (pinned inside the workflow, so the Action version follows the workflow tag you call), and uploads one JSON report artifact per repository. Scans stay local: the Action reads the checked-out repository and bundled data only, and makes no network requests.

## Calling the workflow

Create a workflow in any repository in the organization that calls the reusable workflow:

```yaml
name: Evergreen organization scan

on:
  schedule:
    - cron: "0 4 * * 1"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  org-scan:
    uses: arminazimi/evergreen/.github/workflows/org-scan.yml@v0.8.0
    with:
      organization: your-org
    secrets:
      github-token: ${{ secrets.EVERGREEN_ORG_TOKEN }}
```

Run it on a schedule, dispatch it manually, or gate your own workflow on it with `needs`.

## Inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `organization` | callers repository owner | The GitHub organization to scan. It must be an organization; user accounts are not supported. |
| `fail-on-severity` | `high` | Lowest severity that fails one repository's scan job: `none`, `info`, `low`, `medium`, `high`, or `critical`. |
| `max-jobs` | `10` | Maximum number of repositories scanned in parallel. Concurrency stays bounded while the matrix scales with the repository count. |

## Token

Listing an organization's repositories needs a token that can read the org. Pass `github-token: ${{ secrets.GITHUB_TOKEN }}` when your caller can already read the org, or create a dedicated token with only read access to the organization and store it as a caller secret. The token is never used by a scan: scans read repository contents and bundled data offline.

## Results

Each scan job checks out its repository at the default branch and runs the Evergreen Action, so the full Action behavior applies per repository: annotations, the severity gate, and the versioned JSON report. Reports are uploaded as one artifact per repository, named `evergreen-report-<repository>`, retained for 14 days.

A scan job fails when a repository has findings at or above `fail-on-severity`, so the calling workflow fails if any repository crossed the gate. To get an organization-wide view instead of a gate, set `fail-on-severity: none`.

SARIF uploads to code scanning are per-repository, and the reusable workflow keeps them off by default. A repository that wants its findings in code scanning is better served by its own pull-request workflow with `upload-sarif: true` (see [GitHub Action](GITHUB_ACTION.md)).

## Limits

GitHub Actions caps a matrix at 256 jobs, so an organization with more than 256 scannable repositories (archived and disabled repositories are skipped) needs call sites split into batches; call the workflow once per sub-organization. Archived and disabled repositories are skipped; forks and internal repositories are scanned unless the token cannot read them.
