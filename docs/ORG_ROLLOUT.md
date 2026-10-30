{% raw %}
# Organization rollout

This guide takes one person from an unconfigured organization to a weekly lifecycle report for every repository in it. It is written to be followed in order:

1. Create a read-only token.
2. Add the organization-scan workflow.
3. Accept existing findings with a baseline.
4. Read the reports the workflow leaves behind.
5. Send the recurring digest to Slack or Teams.
6. Offer the per-repository starter from the organization's `.github` repository.
7. Open adoption pull requests at scale (optional).

The scan itself stays local. The organization-scan workflow lists repositories and downloads artifacts through the GitHub API; each scan checks out one repository and reads its files and Evergreen's bundled data, with no network access. Per-repository adoption uses one `uses:` line that calls the reusable scan workflow.

> **Version.** The reusable workflows and the `org:rollout` tool first ship in `v0.8.0`. The examples below call `@v0.8.0`. Until that tag exists, call `@main` only to try a workflow, then replace it with the release tag before relying on it.

## Before you start

You need:

- An organization owner to approve a fine-grained token, or a repository admin for the caller repository to add its secrets. The same person often fills both roles.
- One repository in the organization to host the caller workflow. A small operations or `.github` repository is a good home.
- GitHub Actions enabled in that repository.
- Optional: admin access to the Slack workspace or Teams channel that should receive the digest.
- Optional, for the local baseline and rollup commands: Node.js 22 or newer.

The caller repository is scanned like every other repository in the organization. It is not special.

## 1. Create a read-only organization token

The workflow needs a token that can list the organization's repositories and read each repository's contents. It does not need write access to anything, and no scan ever receives the token.

### Fine-grained token (recommended)

Create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new):

1. Set **Resource owner** to the organization.
2. Set **Repository access** to **All repositories**. A token scoped to selected repositories cannot list the whole organization.
3. Under **Repository permissions**, set **Contents** to **Read-only** and leave **Metadata** at its mandatory **Read-only** value.
4. Set an expiration you are willing to rotate. The workflow fails when the token expires, so put the rotation date on a calendar.
5. Create the token, approve it if the organization requires approval, and copy the value once.

### Classic token

If your organization still uses classic tokens, create one with:

| Repository visibility | Scopes |
| --- | --- |
| Private repositories included | `repo`, `read:org` |
| Public repositories only | `public_repo`, `read:org` |

`read:org` lets the token list the organization. `repo` (or `public_repo`) lets it read repository contents for the checkout.

### Store and verify it

Store the token as an Actions secret in the caller repository. `gh secret set` prompts for the value, so the token does not land in shell history:

```bash
gh secret set EVERGREEN_ORG_TOKEN --repo your-org/your-ops-repo
```

Before relying on it, check that the token can see the repositories you expect. This prints the number of active, non-archived repositories:

```bash
GH_TOKEN=github_pat_your_token \
  gh api --paginate "/orgs/your-org/repos?per_page=100" \
  --jq '[.[] | select(.archived == false and .disabled == false)] | length'
```

A `404` usually means the token cannot see the organization; a `403` usually means the organization has not approved the token or it lacks a required scope.

If you omit the `github-token` secret, the workflow falls back to the caller's `GITHUB_TOKEN`. That works only when the caller's token can already read every repository, which is uncommon for an organization-wide list. Prefer the dedicated token.

## 2. Add the caller workflow

Add one workflow to the caller repository. It calls [`.github/workflows/org-scan.yml`](../.github/workflows/org-scan.yml), which lists the organization's repositories and scans each one in a bounded matrix through the first-party Evergreen Action. The Action version follows the workflow tag you call, so pinning the workflow pins the scanner.

Create `.github/workflows/evergreen-org-scan.yml`:

```yaml
name: Evergreen organization scan

on:
  schedule:
    - cron: "0 4 * * 1"
  workflow_dispatch:

permissions:
  contents: read
  # Only needed for the Slack/Teams digest. Remove it if you do not post one.
  actions: read

jobs:
  org-scan:
    uses: arminazimi/evergreen/.github/workflows/org-scan.yml@v0.8.0
    with:
      organization: your-org
      fail-on-severity: high
      max-jobs: 10
    secrets:
      github-token: ${{ secrets.EVERGREEN_ORG_TOKEN }}
      slack-webhook-url: ${{ secrets.EVERGREEN_SLACK_WEBHOOK }}   # optional
      teams-webhook-url: ${{ secrets.EVERGREEN_TEAMS_WEBHOOK }}   # optional
```

Commit it, then run it once by hand:

```bash
gh workflow run evergreen-org-scan.yml --repo your-org/your-ops-repo
gh run list --repo your-org/your-ops-repo --workflow evergreen-org-scan.yml --limit 1
gh run watch <run-id> --repo your-org/your-ops-repo
```

The first run has three visible parts:

- **List repositories.** One job calls `GET /orgs/<org>/repos`, skips archived and disabled repositories, and prints how many it found.
- **Scan <repository>.** One matrix job per repository checks out its default branch and runs the Evergreen Action. Progress and annotations are per repository, so a failure names the repository.
- **Send digest.** After the matrix finishes, one job builds a rollup and posts it to the configured webhooks. It is skipped when neither webhook secret is set.

### Inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `organization` | caller repository owner | The GitHub organization to scan. It must be an organization; user accounts are not supported. |
| `fail-on-severity` | `high` | Lowest severity that fails one repository's scan job: `none`, `info`, `low`, `medium`, `high`, or `critical`. |
| `max-jobs` | `10` | Maximum number of repositories scanned in parallel. Concurrency stays bounded while the matrix scales with the repository count. |

For the first inventory run, set `fail-on-severity: none`. The workflow then finishes successfully even when repositories have findings, which makes the artifacts and digest easy to inspect. Tighten it to `high` once the backlog is triaged, or move the gate to per-repository pull-request workflows with baselines (see [step 3](#3-accept-existing-findings-with-a-baseline)).

A scan job fails when a repository has findings at or above `fail-on-severity`, so the calling workflow fails if any repository crossed the gate. Matrix jobs do not cancel each other (`fail-fast: false`), so every repository is still scanned and every report is still uploaded.

### If you only want an inventory

Set `fail-on-severity: none` and leave the schedule as it is. The run is a weekly inventory: reports and the digest are produced, but no repository fails the workflow. Add per-repository pull-request workflows (see [step 3](#3-accept-existing-findings-with-a-baseline)) when you want a gate that blocks new findings.

## 3. Accept existing findings with a baseline

A baseline records findings you have reviewed and accepted. It is usually a file committed in each repository. Findings in the baseline are suppressed; findings that are not in it are reported and gated normally.

Run this in the repository whose findings you are accepting:

```bash
npx evergreen-deprecation scan . --fail-on none
npx evergreen-deprecation baseline . --output .evergreen-baseline.json
```

The second command writes one entry per current finding and keeps the file's history when it already exists, so running it again updates the file instead of starting over:

```text
Wrote 5 findings to /path/to/repository/.evergreen-baseline.json
No earlier baseline to compare with.
```

Review the file, then commit it:

```bash
git add .evergreen-baseline.json
git commit -m "chore: accept current Evergreen findings"
```

A scan that uses the baseline now hides exactly those findings:

```bash
npx evergreen-deprecation scan . --baseline .evergreen-baseline.json --fail-on high
```

```text
Findings: 0
...
Baseline: 5 findings suppressed, 0 expiring within 14 days, 0 expired.
```

### Add an owner, a reason, and an expiry

Every entry can carry optional context. These fields never change what is suppressed, but they make the acceptance reviewable and let it expire:

```json
{
  "fingerprint": "6ca0234cda96c4bf931e7686f5a74bff85d0063cb143d25ec64136c9102343d3",
  "ruleId": "nodejs.runtime.eol-18",
  "path": "package.json",
  "owner": "platform-team",
  "reason": "Upgrade tracked in PLAT-12",
  "created": "2026-10-29",
  "expires": "2027-01-31"
}
```

`owner` and `reason` are non-empty text up to 500 characters. `created` and `expires` are `YYYY-MM-DD` calendar dates, and `expires` cannot be before `created`. Expired suppressions stop hiding their finding; a scan also warns 14 days before an expiry unless you change the window:

```bash
npx evergreen-deprecation scan . --baseline .evergreen-baseline.json --baseline-warn-days 30
```

`--on-expired resurface` (the default) reports the finding again after its expiry day. `--on-expired fail` reports it and also fails the scan. See the [baseline format](GITHUB_ACTION.md#pull-request-workflow) for the full field reference.

### Wire the baseline into the per-repository workflow

The baseline only takes effect where a workflow passes it to the Action or the reusable workflow. Prefer one `uses:` line that calls the reusable workflow:

```yaml
jobs:
  lifecycle:
    uses: arminazimi/evergreen/.github/workflows/evergreen-reusable.yml@v0.8.0
    with:
      baseline: .evergreen-baseline.json
      fail-on-severity: high
```

Or pass the same inputs on the Action step directly:

```yaml
- uses: arminazimi/evergreen@v0.8.0
  with:
    baseline: .evergreen-baseline.json
    fail-on-severity: high
```

The organization-wide scan workflow (`org-scan.yml`) does not pass a `baseline` input: it scans each repository with the Action's defaults and reports every finding. Use it with `fail-on-severity: none` as the inventory and digest, and use the per-repository workflow above for the pull-request gate. This is also the workflow created by the adoption pull requests in [step 7](#7-open-adoption-pull-requests-at-scale); add the `baseline` line to that file when you accept its first report.

A shared baseline can be combined with the repository's own on the command line:

```bash
npx evergreen-deprecation scan . \
  --baseline ../org-config/evergreen-baseline.json \
  --baseline .evergreen-baseline.json
```

`--baseline` is repeatable on the CLI. The Action input takes one path, so keep the repository's own file as the one the workflow reads and merge shared entries into it, or check out the shared file in the workflow and point `baseline` at that path.

## 4. Read the report artifacts

Each scan job writes a versioned JSON report and uploads it as an artifact named `evergreen-report-<repository>`. Artifacts are retained for 14 days.

In GitHub, open the run from **Actions → Evergreen organization scan**, scroll to **Artifacts**, and download the artifact for one repository. It contains `evergreen-report.json`. The run's job summary also shows the counts per severity, the ten most severe findings, and a link to the evidence for each one.

From a terminal, download every report from a run and merge them into one organization view:

```bash
gh run list --repo your-org/your-ops-repo --workflow evergreen-org-scan.yml --limit 1
gh run download <run-id> --repo your-org/your-ops-repo \
  --pattern 'evergreen-report-*' --dir org-reports
npx evergreen-deprecation rollup org-reports/*/evergreen-report.json
```

The rollup reads the saved reports and nothing else, so it uses no network and does not touch the repositories. It prints totals, then counts grouped by repository, product, and owner:

```text
Evergreen rollup: 7 findings across 2 repositories

By repository:
  sample-api: 5 (2 high, 3 medium; nearest deadline 2020-02-11)
  sample-web: 2 (2 high; nearest deadline 2024-07-24)

By product:
  nodejs: 3 (3 medium) in sample-api
  github-actions: 2 (2 high) in sample-api, sample-web
  npm: 2 (2 high) in sample-api, sample-web

By owner:
  unowned: 7 (4 high, 3 medium) in sample-api, sample-web
```

The repository name comes from the artifact directory: `org-reports/evergreen-report-sample-api/evergreen-report.json` becomes `sample-api`. A repository with no matching artifact is absent, not counted as clean.

### Add owners

Create an `owners.json` that maps repository names to teams, then pass it to the rollup:

```json
{
  "sample-api": "platform",
  "sample-web": "frontend"
}
```

```bash
npx evergreen-deprecation rollup org-reports/*/evergreen-report.json --owners owners.json
```

A repository missing from the file is grouped under `unowned`. This is the same grouping the Slack and Teams digest uses.

### Read the JSON directly

The report is `evergreen.scan.v1` (schema: [`schemas/scan.v1.schema.json`](../schemas/scan.v1.schema.json)). Each finding names its rule, severity, exact location, deadline when the source gives one, replacement, and evidence:

```json
{
  "schemaVersion": "evergreen.scan.v1",
  "findings": [
    {
      "ruleId": "github-actions.checkout.node20",
      "severity": "high",
      "location": { "path": ".github/workflows/ci.yml", "line": 7 },
      "deadline": "2026-09-23",
      "replacement": "actions/checkout@v5 or later",
      "sources": [{ "title": "GitHub changelog", "url": "https://github.blog/..." }]
    }
  ]
}
```

Suppressed findings are absent from the report. A scan that used a baseline adds a `suppressions` object that says how many it hid and which entries are expiring or expired.

### Optional: publish one page

The same rollup renders as a self-contained HTML page:

```bash
npx evergreen-deprecation rollup org-reports/*/evergreen-report.json \
  --owners owners.json --html > org-report.html
```

[`templates/rollup/`](../templates/rollup/) packages that command as a GitHub Pages workflow. It runs after a successful organization scan, downloads the same artifacts, and publishes the page without a server. It only runs when the scan succeeds, so use `fail-on-severity: none` if you want the page even while the backlog is ungated.

### Optional: developer portals

To show the same lifecycle risk in Backstage, Grafana, Port, or Cortex — from one offline `export --format portal` catalog — see [Developer portals](PORTALS.md).

## 5. Set up the recurring digest

The schedule in [step 2](#2-add-the-caller-workflow) is the recurrence. This step connects it to a chat channel.

After the scan jobs finish, the reusable workflow downloads the run's `evergreen-report-*` artifacts and renders the same text as `evergreen rollup`. It lists the total findings across every repository by severity, repository, product, and owner, with each repository's nearest deadline. It posts even when some scan jobs failed, so a red run does not silence the weekly numbers.

Enable one or both webhooks by adding the secrets and passing them from the caller:

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

The caller also needs `actions: read`, because the digest downloads the artifacts of its own run. Without that permission the notify job cannot read the artifacts; the scan jobs are unaffected.

If neither webhook secret is set, the notify job is skipped entirely and no outbound request is made.

### Set up the Slack webhook

1. Open [api.slack.com/apps](https://api.slack.com/apps) and create (or choose) an app for the channel that should receive digests.
2. Under **Features → Incoming Webhooks**, enable incoming webhooks and click **Add New Webhook to Workspace**.
3. Select the target channel and confirm. Slack shows a URL of the form `https://hooks.slack.com/services/T…/B…/…`.
4. In GitHub, open **Settings → Secrets and variables → Actions** in the repository that calls the org-scan workflow.
5. Create a secret named `EVERGREEN_SLACK_WEBHOOK` and paste the webhook URL as its value. Treat the URL as a credential: anyone who has it can post to the channel.
6. Pass it to the workflow with `secrets: slack-webhook-url: ${{ secrets.EVERGREEN_SLACK_WEBHOOK }}`.

### Set up the Teams webhook

Teams uses Workflow webhooks, not the legacy Incoming Webhook connector, which Microsoft is retiring. The Workflow webhook produces a URL compatible with Evergreen's Adaptive Card payload.

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

### Test the digest

Run the workflow by hand and confirm the message arrives in the channel:

```bash
gh workflow run evergreen-org-scan.yml --repo your-org/your-ops-repo
```

The workflow truncates the digest to Slack's 3,000-character section limit, adding a `…truncated` marker. Keep the channel to the summary and use the artifacts or the [rollup page](#optional-publish-one-page) for the full list.

## 6. Offer the starter from the organization's `.github` repository

So each repository can add Evergreen from the Actions **New workflow** gallery instead of pasting YAML by hand, put the starter in the organization's [`.github` repository](https://docs.github.com/en/actions/sharing-automations/creating-workflow-templates-for-your-organization):

1. Create `your-org/.github` if it does not exist.
2. Copy both files from [`templates/workflows/`](../templates/workflows/) into that repository:

```text
workflow-templates/evergreen.yml
workflow-templates/evergreen.properties.json
```

3. Commit them on the default branch. The next time someone opens **Actions → New workflow** in a repository of the organization, **Evergreen lifecycle scan** appears in the list.

The starter is one job with one `uses:` line. It calls [`.github/workflows/evergreen-reusable.yml`](../.github/workflows/evergreen-reusable.yml) on pull requests, pushes to the default branch, a weekly schedule, and `workflow_dispatch`, with `contents: read` only:

```yaml
name: Evergreen

on:
  pull_request:
  push:
    branches: [$default-branch]
  schedule:
    - cron: "0 4 * * 1"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  lifecycle:
    uses: arminazimi/evergreen/.github/workflows/evergreen-reusable.yml@v0.8.0
```

`$default-branch` is GitHub's placeholder; it becomes the repository's real default branch when someone creates the workflow from the gallery. Until `v0.8.0` is tagged, replace `@v0.8.0` with `@main` in the copy under `workflow-templates/`, then pin the release tag before relying on it. To accept existing findings later, add `with: baseline: .evergreen-baseline.json` on that job (see [step 3](#3-accept-existing-findings-with-a-baseline)). Inputs, outputs, and the permission boundary are documented under [Reusable workflow](GITHUB_ACTION.md#reusable-workflow-one-uses-line).

## 7. Open adoption pull requests at scale

The organization-scan workflow covers every repository on a schedule. To put a pull-request workflow in every repository without waiting for each team to open the gallery, Evergreen can open the adoption pull requests for you. Evergreen lands best as one reviewed change per repository. The rollout tool (`tools/org-rollout.ts`) turns that into a single step: it lists the target repositories, shows exactly what it would change, and only opens pull requests when you explicitly ask for it. Nothing is ever pushed directly to a default branch, and scans stay offline: the tool's own network calls are GitHub API calls, never repository analysis.

Run it from a checkout of this repository:

```bash
npm ci
npm run org:rollout -- --org my-org                    # print the plan, change nothing
npm run org:rollout -- --org my-org --apply            # open one pull request per repository
npm run org:rollout -- --repos acme/api,acme/web       # a specific repository list instead of an org
```

`--apply` needs `GITHUB_TOKEN` or `GH_TOKEN` with write access to the target repositories. A token with read-only access can still run the dry run.

### What it does

For every target repository (non-archived, not a fork, with a default branch) it:

1. Checks whether any existing workflow under `.github/workflows/` already invokes `arminazimi/evergreen`. If one does, the repository is skipped, so reapplication can never stack duplicate workflows.
2. Resolves the action version to pin. Pass `--action-ref v0.8.0` for a fixed version; otherwise the tool pins the repository's latest release tag.
3. Prints the plan: each repository with `pull-request` or `skip`, the totals, and the full workflow file that would be added. **Without `--apply` this is the whole run.**
4. With `--apply`, and a token with write access, it opens one pull request per repository. The pull request creates the branch, adds `.github/workflows/evergreen.yml` (the workflow in [GitHub Action](GITHUB_ACTION.md)), and opens the pull request against the default branch.

The generated workflow runs the scan on pull requests, on a weekly schedule (`--schedule`, default `0 4 * * 1`), and on demand via `workflow_dispatch`. It needs no configuration: read-only permissions, no secrets, findings as annotations, and a `high` severity gate. To accept existing findings, commit the baseline from [step 3](#3-accept-existing-findings-with-a-baseline) and add the `baseline` input to the generated workflow in the same pull request:

```yaml
- uses: arminazimi/evergreen@v0.8.0
  with:
    baseline: .evergreen-baseline.json
    fail-on-severity: high
```

Without the input, the Action reports every finding even though the baseline file is committed.

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

## Limits

GitHub Actions caps a matrix at 256 jobs, so an organization with more than 256 scannable repositories (archived and disabled repositories are skipped) needs call sites split into batches; call the workflow once per sub-organization. Archived and disabled repositories are skipped; forks and internal repositories are scanned unless the token cannot read them.

Artifacts are retained for 14 days. Download or roll up a run's reports before they expire if you need a longer history, or publish the [rollup page](#optional-publish-one-page) from a workflow that runs alongside the scan.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `List repositories` fails with `404` | The token cannot see the organization. Check its resource owner, repository access, and organization approval. |
| `List repositories` fails with `403` | The token is missing `contents`/`repo` or `read:org`, or the organization restricts fine-grained tokens. |
| A scan job cannot check out a repository | The token cannot read that repository's contents. Give it **All repositories**, not a selected list. |
| The digest is skipped | Neither `slack-webhook-url` nor `teams-webhook-url` was passed. |
| The digest job fails at `Download scan reports` | The caller did not grant `actions: read`. The reusable workflow cannot elevate its own permissions. |
| Committed baselines have no effect | The workflow did not pass `baseline`. Add it to the per-repository Action step. The organization scan does not pass one. |
| The workflow reports `v0.8.0` not found | The release is not tagged yet. Use `@main` to try it, then pin the release tag. |

## Privacy and permissions

| What | Where it runs | Network |
| --- | --- | --- |
| List repositories | GitHub Actions, caller repository | `GET /orgs/<org>/repos` |
| Scan one repository | GitHub Actions, checked-out repository | None. Files and bundled data only. |
| Upload reports | GitHub Actions artifacts | Normal Actions artifact storage, 14 days |
| Rollup digest | GitHub Actions, notify job | Reads local artifacts, then posts to the configured webhook |
| `evergreen baseline`, `evergreen rollup` | Your machine or CI | None. Local files only. |

Only `contents: read` is needed for the scans. Add `actions: read` for the digest. The dedicated token is used only by the list job; it is never passed to a scan. Evergreen does not send repository contents to an Evergreen service, and the report can contain repository-relative paths, matched excerpts, dependency versions, and lifecycle evidence, so apply normal artifact access controls.
{% endraw %}
