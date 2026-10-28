{% raw %}
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
      slack-webhook-url: ${{ secrets.EVERGREEN_SLACK_WEBHOOK }}   # optional
      teams-webhook-url: ${{ secrets.EVERGREEN_TEAMS_WEBHOOK }}   # optional
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

## Weekly digest to Slack or Teams

After all scan jobs finish, the reusable workflow can post a rollup digest to a Slack channel or a Microsoft Teams channel. The digest lists the total findings across every repository, broken down by severity, product, and owner — the same text `evergreen rollup` prints locally.

To enable it, pass one or both webhook secrets from your caller:

```yaml
jobs:
  org-scan:
    uses: arminazimi/evergreen/.github/workflows/org-scan.yml@v0.8.0
    with:
      organization: your-org
    secrets:
      github-token: ${{ secrets.EVERGREEN_ORG_TOKEN }}
      slack-webhook-url: ${{ secrets.EVERGREEN_SLACK_WEBHOOK }}
      teams-webhook-url: ${{ secrets.EVERGREEN_TEAMS_WEBHOOK }}
```

If neither secret is set, the notify step is skipped entirely and no outbound request is made.

### Setting up the Slack webhook

1. Open [api.slack.com/apps](https://api.slack.com/apps) and create (or choose) an app for the channel that should receive digests.
2. Under **Features → Incoming Webhooks**, enable incoming webhooks and click **Add New Webhook to Workspace**.
3. Select the target channel and confirm. Slack shows a URL of the form `https://hooks.slack.com/services/T…/B…/…`.
4. In GitHub, open **Settings → Secrets and variables → Actions** in the repository that calls the org-scan workflow.
5. Create a secret named `EVERGREEN_SLACK_WEBHOOK` and paste the webhook URL as its value. Treat the URL as a credential — anyone who has it can post to the channel.
6. Pass it to the workflow with `secrets: slack-webhook-url: ${{ secrets.EVERGREEN_SLACK_WEBHOOK }}`.

### Setting up the Teams webhook

Teams uses Workflow webhooks (not the legacy Incoming Webhook connector, which Microsoft is retiring). The Workflow webhook produces a URL compatible with Evergreen's Adaptive Card payload.

1. In the Teams channel that should receive digests, open **… → Workflows**.
2. Search for **Post to a channel when a webhook request is received** and select it.
3. Follow the setup wizard. Teams generates a URL of the form `https://prod-XX.westeurope.logic.azure.com/…`.
4. In GitHub, create a secret named `EVERGREEN_TEAMS_WEBHOOK` and paste the URL.
5. Pass it to the workflow with `secrets: teams-webhook-url: ${{ secrets.EVERGREEN_TEAMS_WEBHOOK }}`.

### Secrets table

| Secret | Required | Meaning |
| --- | --- | --- |
| `slack-webhook-url` | No | Incoming-webhook URL. When set, a Slack digest is posted after every scan. |
| `teams-webhook-url` | No | Workflow-webhook URL. When set, a Teams digest is posted after every scan. |

Both secrets are optional and independent. You can enable Slack, Teams, both, or neither.

## Limits

GitHub Actions caps a matrix at 256 jobs, so an organization with more than 256 scannable repositories (archived and disabled repositories are skipped) needs call sites split into batches; call the workflow once per sub-organization. Archived and disabled repositories are skipped; forks and internal repositories are scanned unless the token cannot read them.

## Opening adoption pull requests

Besides the reusable scan workflow above, Evergreen can open the adoption pull requests for you. Evergreen lands best as one reviewed change per repository. The rollout tool (`tools/org-rollout.ts`) turns that into a single step: it lists the target repositories, shows exactly what it would change, and only opens pull requests when you explicitly ask for it. Nothing is ever pushed directly to a default branch, and scans stay offline — the tool's own network calls are GitHub API calls, never repository analysis.

```bash
npm run org:rollout -- --org my-org                    # print the plan, change nothing
npm run org:rollout -- --org my-org --apply            # open one pull request per repository
npm run org:rollout -- --repos acme/api,acme/web       # a specific repository list instead of an org
```

### What it does

For every target repository (non-archived, not a fork, with a default branch) it:

1. Checks whether any existing workflow under `.github/workflows/` already invokes `arminazimi/evergreen`. If one does, the repository is skipped — reapplication can never stack duplicate workflows.
2. Resolves the action version to pin. Pass `--action-ref v0.7.1` for a fixed version; otherwise the tool pins the repository's latest release tag.
3. Prints the plan: each repository with `pull-request` or `skip`, the totals, and the full workflow file that would be added. **Without `--apply` this is the whole run.**
4. With `--apply`, and a token (`GITHUB_TOKEN` or `GH_TOKEN`) with write access it opens one pull request per repository that creates the branch, adds [`.github/workflows/evergreen.yml`](GITHUB_ACTION.md), and opens the pull request against the default branch.

The workflow runs the scan on pull requests, on a weekly schedule (`--schedule`, default `0 4 * * 1`), and on demand via `workflow_dispatch`. It needs no configuration: read-only permissions, no secrets, findings as annotations, and a `high` severity gate. To accept existing findings, the pull request body points to the baseline command:

```bash
npx evergreen-deprecation baseline . --output .evergreen-baseline.json
```

### Options

| Option | Default | Meaning |
| --- | --- | --- |
| `--org <name>` | — | Target every qualifying repository of this organization. |
| `--repos <list>` | — | Comma-separated `owner/name` list instead of an organization. |
| `--apply` | off | Open the pull requests. Without it, only the plan is printed. |
| `--schedule <cron>` | `0 4 * * 1` | Cron expression for the weekly scan. |
| `--action-ref <ref>` | latest release | Action version to pin. |
| `--branch <name>` | `evergreen/lifecycle-scan` | Rollout branch name. A branch left behind by an earlier run is reused. |

### Design rules

- **Reviewed, never silent.** A rollout starts as a printed plan; opening pull requests is a deliberate `--apply`. Closing a pull request opts that repository out.
- **Idempotent in review.** Re-running the dry run after some merges only plans the repositories still missing the workflow.
- **Failures are reported, not hidden.** A repository that cannot take its pull request (no token, branch conflict) is listed at the end with its GitHub API error and the run exits nonzero; the rest still complete.
{% endraw %}
