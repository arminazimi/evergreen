{% raw %}
# GitHub Action

Evergreen's reusable Action scans the checked-out repository locally, emits GitHub annotations for findings, compares against an optional baseline, enforces a severity gate, and uploads the versioned JSON result.

## Pull-request workflow

```yaml
name: Evergreen

on:
  pull_request:

permissions:
  contents: read

jobs:
  lifecycle:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: arminazimi/evergreen@v0.7.1
        with:
          baseline: .evergreen-baseline.json
          fail-on-severity: high
```

Version tags provide stable release references. Pin a full commit SHA when your threat model requires immutable third-party action references.

## Reusable workflow (one `uses:` line)

Organizations that want the same scan in every repository without copying checkout and Action steps can call the reusable workflow instead. It checks out the caller, runs Evergreen with the common inputs, and needs only `contents: read`. The Action version is pinned inside the workflow file, so pinning the workflow pins the scanner.

```yaml
name: Evergreen

on:
  pull_request:
  push:
    branches: [main]
  schedule:
    - cron: "0 4 * * 1"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  lifecycle:
    uses: arminazimi/evergreen/.github/workflows/evergreen-reusable.yml@v0.8.0
    with:
      baseline: .evergreen-baseline.json
      fail-on-severity: high
```

> **Version.** The reusable workflow first ships in `v0.8.0`. Until that tag exists, call `@main` only to try it, then replace it with the release tag before relying on it.

Every workflow input is optional and matches the Action default of the same name. Pass only what you need to change:

| Workflow input | Default | Meaning |
| --- | --- | --- |
| `path` | `.` | Repository root or subdirectory to scan. |
| `paths` | empty | Multi-line list of directories or globs relative to `path`. |
| `baseline` | empty | Baseline path relative to `path`. |
| `baseline-warn-days` | `14` | Warn when a baseline suppression expires within this many days. |
| `on-expired` | `resurface` | `resurface` or `fail` after a suppression's `expires` day. |
| `min-support-days` | empty | Warn on lines whose support ends within this many days. |
| `fail-on-severity` | `high` | Lowest failing level: `none`, `info`, `low`, `medium`, `high`, or `critical`. |
| `mode` | `scan` | `scan` or `diff` (diff fetches full history for the base and head SHAs). |
| `annotations` | empty | `changed`, `all`, or `none`; empty keeps the Action default. |
| `report-name` | `evergreen-report` | Artifact name when `upload-report` is true. |
| `upload-report` | `true` | Upload the JSON report as an Actions artifact. |
| `attribution` | `true` | Credit Evergreen in the job summary. |

The workflow exposes the same result outputs as the Action (`report-path`, `finding-count`, `has-new-findings`, `highest-severity`, `next-eol-date`, `findings-json`) so a later job can branch on them. Features that need write permissions — `pr-comment`, `suggest-fixes`, `commands`, `fix-pr`, `tracking-issue`, `upload-sarif`, `upload-badge` — stay on the Action step above; the reusable workflow keeps the minimal `contents: read` permission set.

For an organization `.github` repository that offers the starter in the Actions "New workflow" gallery, copy [`templates/workflows/`](../templates/workflows/) into that repository's `workflow-templates/` directory. See [Organization rollout](ORG_ROLLOUT.md#offer-the-starter-from-the-organizations-github-repository).

### SHA-pinned actions

For the first-party actions covered by Evergreen, a full 40-character commit pin is classified in this order:

1. A trailing release comment, such as `# v4`, `# v4.1.1`, `# tag=v4.1.1`, or `# version: v4.1.1`.
2. Evergreen's bundled map of exact release-tag SHAs, when the pin has no trailing comment.

```yaml
- uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
```

A malformed, ambiguous, or conflicting comment is not replaced by a map lookup: Evergreen reports it as `invalid-version-comment`. A SHA absent from the bundled map is reported as `unknown-sha`. These references are not lifecycle findings, so they do not affect severity gates or annotations.

The uploaded JSON report records the total in `unclassified.count` and lists each reference with its action, SHA, reason, and workflow location under `unclassified.references`. CLI text output adds a one-line count when any exist. Classification uses only repository contents and the bundled map; scans make no network requests.

Create and commit the baseline locally when existing findings are accepted:

```bash
npx evergreen-deprecation baseline . --output .evergreen-baseline.json
```

A baseline entry can also say why a finding is accepted and until when. These fields are all optional, so a baseline written without them keeps working, and they never change which findings are suppressed:

```json
{ "fingerprint": "…", "ruleId": "nodejs.runtime.eol-20", "path": "package.json",
  "owner": "platform-team", "reason": "Upgrade tracked in PLAT-12", "created": "2026-10-17", "expires": "2027-01-31" }
```

`owner` and `reason` are non-empty text (up to 500 characters); `created` and `expires` are calendar dates (`YYYY-MM-DD`), and `expires` is not before `created`. An entry with a malformed field makes the baseline fail to load, with the entry's position in the message. The schema is [`schemas/baseline.v1.schema.json`](../schemas/baseline.v1.schema.json). **Expiry warnings.** When a scan uses a baseline, every suppression that matched a finding and expires within the next 14 days is listed in the scan's diagnostics (and as a `warning` on the Action run), soonest first, with its owner and reason:

```text
Baseline suppression expires in 5 days (2026-10-22): nodejs.runtime.eol-18 at package.json (owner: platform-team; reason: Upgrade tracked in PLAT-12).
```

Change the window with `--baseline-warn-days <n>` on `evergreen scan` or the `baseline-warn-days` Action input (0 to 365). The comparison day is today in UTC; `--today YYYY-MM-DD` sets it explicitly, which makes a run reproducible; suppression dates are compared only with that day.

**After `expires`.** A suppression is in force through its `expires` day and expired from the next day. An expired suppression stops hiding its finding: the finding is reported again, and the diagnostics say which suppression expired, how long ago, and its owner and reason. What happens beyond that is a policy, `--on-expired` on `evergreen scan` or the `on-expired` Action input:

| Policy | Behavior |
| --- | --- |
| `resurface` (default) | The finding is back in the results and is judged by the usual severity gate. |
| `fail` | The finding is back, and the scan also fails (the CLI exits 1, the Action fails the job) if any suppression has expired, even when the finding is below the gate. |

Only entries with an `expires` can expire, so a baseline written before these fields behaves exactly as before. A finding stays hidden while at least one of its suppressions is in force.

**Seeing what a baseline does.** A scan that uses a baseline never hides suppressions silently. `evergreen scan --json` adds a `suppressions` object to the result (and `scan.v1.schema.json` documents it): how many findings the baseline hid, the day it compared with, and the `expiring` and `expired` suppressions with their rule, path, `expires` day, owner, and reason. The text report ends its findings with a line such as `Baseline: 3 findings suppressed, 1 expiring within 14 days, 0 expired.`, the Action's job summary shows the same line and a table of the expiring and expired suppressions, and the MCP `scan_repository` tool returns the object when it is given a `baseline`. A scan without a baseline has no `suppressions` field.

**Upgrading needs no migration.** A baseline written by an earlier version (the `evergreen.baseline.v1` schema, with only `fingerprint`, `ruleId`, and `path`) loads and suppresses exactly what it always did; a test loads a baseline written by the published 0.1.0 against the current scanner. Fingerprints do not depend on the new fields, so adding an owner or reason to an existing entry by hand does not change what it suppresses. A newer release can report findings that an older baseline never recorded (for example a rule added since); those appear as new, which is the point of a baseline.

The Action then annotates and gates only findings not represented by that baseline.

## Chat and webhook digests

`evergreen scan --format slack`, `--format teams`, and `--format webhook` print a JSON payload to standard output. Evergreen only renders the payload and never sends it: the network call belongs to a step you write, so the scan itself stays offline.

- `slack` is a Slack incoming-webhook message: a fallback `text`, a header, a counts summary, and one section per finding. It fits Slack's 50-block and 3,000-character section limits.
- `teams` is a Microsoft Teams message with an Adaptive Card (version 1.4) for a Teams workflow webhook.
- `webhook` is a generic JSON payload (`schemaVersion: "evergreen.webhook.v1"`) with a count per severity and every finding, for any system that accepts JSON.

The chat formats list at most 20 findings, most severe first, and say how many were left out; `webhook` lists them all. Output is deterministic, with no timestamps in the chat formats.

Pipe the payload into your own webhook step. The URL lives in a secret, and the step runs only where you choose:

```yaml
- uses: actions/checkout@v7
- run: npm ci   # your project must already depend on evergreen-deprecation
- name: Post digest to Slack
  if: always()
  run: npx --no-install evergreen-deprecation scan . --format slack | curl -sS -X POST -H "Content-Type: application/json" --data @- "$SLACK_WEBHOOK_URL"
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

Use `--format teams` with a Teams workflow URL, or `--format webhook` with any endpoint, in the same way.

## Inputs and outputs

Every input is optional. The values below are the defaults used when a workflow
does not provide a `with` entry.

| Input | Default | Meaning |
| --- | --- | --- |
| `path` | `.` | Repository root or subdirectory to scan; `.` is the checked-out repository. |
| `paths` | empty | Multi-line list of directories or globs (for example `packages/*`) relative to `path`. Each match is scanned in one run; findings go into one report and SARIF, with a job-summary section per package. Empty scans only `path`. |
| `baseline` | empty | Baseline path relative to `path` (or to each matched package when `paths` is set). Empty reports every finding; a configured path that is missing fails the Action. |
| `min-support-days` | empty | Warn (medium severity) on lines whose support ends within this many days; off when empty. |
| `baseline-warn-days` | `14` | Warn when a baseline suppression expires within this many days (0 to 365). |
| `on-expired` | `resurface` | What a baseline suppression does after its `expires` day: `resurface` (its finding is reported again) or `fail` (also fail the job). |
| `fail-on-severity` | `high` | Lowest failing level: `none`, `info`, `low`, `medium`, `high`, or `critical`. |
| `mode` | `scan` | `scan` scans the checked-out tree. `diff` compares the pull request base and head SHAs from the event payload and fails only on findings the pull request introduces. See [pull request diff mode](#pull-request-diff-mode). |
| `annotations` | empty | Which findings become workflow annotations: `changed` annotates only findings on lines the pull request added or changed (the default in diff mode), `all` annotates every finding (the default in scan mode), `none` emits no annotations. Findings left out stay counted in the summary and the JSON report. |
| `report-name` | `evergreen-report` | Artifact name for the JSON report when `upload-report` is `true`. |
| `upload-report` | `true` | Upload the JSON report as an Actions artifact. `false` keeps the generated report only on the runner. |
| `upload-sarif` | `false` | Set to `true` to upload the findings to GitHub code scanning as SARIF. Needs `security-events: write`. |
| `upload-badge` | `false` | Generate a Shields.io endpoint JSON and a branded SVG badge, and upload both as the `evergreen-badge` artifact (14 days). |
| `pr-comment` | `false` | Set to `true` to post one summary comment on pull requests (counts and the top findings). Re-runs update the same comment. Needs `pull-requests: write`. |
| `suggest-fixes` | `false` | In diff mode, post one review whose `suggestion` blocks apply the deterministic fixes for findings on lines the pull request changed. Re-runs update the same review. Needs `pull-requests: write`; pull requests from forks are skipped. |
| `commands` | `false` | Set to `true` to answer `/evergreen explain` and `/evergreen ignore` comments when the workflow runs on `issue_comment`. Replies only to owners, members, and collaborators. Needs `pull-requests: write`. |
| `fix-pr` | `false` | Set to `true` to open or update one pull request on `evergreen/fixes` with every deterministic fix, and close it when nothing is left to fix. Runs only on `schedule` and `workflow_dispatch` events. Needs `contents: write` and `pull-requests: write`. See [scheduled fix pull request](#scheduled-fix-pull-request). |
| `tracking-issue` | `false` | Set to `true` in a scheduled workflow to keep one issue listing findings by end-of-life date. Re-runs update the same issue; it closes when nothing is left and reopens when findings return. Needs `issues: write`. |
| `github-token` | `${{ github.token }}` | Token used to post the comment, command reply, or fix suggestions when `pr-comment`, `commands`, or `suggest-fixes` is `true`, to open, update, or close the fix pull request when `fix-pr` is `true`, and to update the tracking issue when `tracking-issue` is `true`. |
| `attribution` | `true` | Adds one line to the job summary saying the scan was done by Evergreen, with a link. Set to `false` to leave it out. |

| Output | Availability | Meaning |
| --- | --- | --- |
| `report-path` | Always | Absolute runner path to the generated JSON report, whether or not `upload-report` is enabled. |
| `finding-count` | Always | Number of findings remaining after baseline comparison, encoded as a decimal string. |
| `has-new-findings` | Always | `true` when at least one finding remains after baseline comparison, `false` otherwise. In diff mode it covers the findings the pull request introduces. |
| `highest-severity` | Always | The highest remaining severity (`info`, `low`, `medium`, `high`, or `critical`), or empty when there are no findings. |
| `next-eol-date` | Always | The earliest end-of-life date among the remaining findings (`YYYY-MM-DD`), or empty when no finding carries a deadline. |
| `findings-json` | Always | The remaining findings as one compact JSON array. Each entry has `id`, `ruleId`, `severity`, `title`, `path`, and `line` and `deadline` when known. |
| `badge-path` | When `upload-badge` is `true` | Absolute runner path to `evergreen-badge.json`; otherwise empty. |
| `badge-svg-path` | When `upload-badge` is `true` | Absolute runner path to `evergreen-badge.svg`, next to the JSON; otherwise empty. |
| `sarif-path` | When `upload-sarif` is `true` | Absolute runner path to the generated SARIF file; otherwise empty. |

The job summary shows how many findings there are per severity, the ten most severe findings with their location and a link to the evidence each one cites, the age of the lifecycle data, and a warning when the data is stale. When there are more than ten findings, it says how many more there are; the JSON report artifact lists them all.

### Branching on results

The outputs describe the findings that remain after baseline comparison, so a later step can act on them without reading the report. Every value is empty or `false` when nothing remains.

| Output | Example value | Meaning |
| --- | --- | --- |
| `has-new-findings` | `true` | `true` when at least one finding remains, `false` otherwise. |
| `highest-severity` | `critical` | The most severe remaining level, or empty when there are none. |
| `next-eol-date` | `2026-09-23` | The earliest deadline among the remaining findings, or empty when none is dated. |
| `findings-json` | `[{"id":"…","ruleId":"…","severity":"high","title":"…","path":"package.json","line":4,"deadline":"2026-09-23"}]` | The remaining findings as one compact JSON array. |

The scan step must pass for the steps after it to run, so this example sets `fail-on-severity: none` and leaves the decision to the later steps:

```yaml
- uses: arminazimi/evergreen@v0
  id: evergreen
  with:
    fail-on-severity: none
- name: Note new findings
  if: steps.evergreen.outputs.has-new-findings == 'true'
  run: echo "Evergreen found new findings; highest severity is ${{ steps.evergreen.outputs.highest-severity }}."
- name: Warn about the next deadline
  if: steps.evergreen.outputs.next-eol-date != ''
  run: echo "The next end of life is ${{ steps.evergreen.outputs.next-eol-date }}."
- name: List finding ids
  run: echo '${{ steps.evergreen.outputs.findings-json }}' | jq -r '.[].id'
```

In diff mode the same outputs cover only the findings the pull request introduces, so `findings-json` lists what the pull request added rather than the whole backlog.

### Monorepo paths

Monorepos should not need one job per package. Set `paths` to a multi-line list of directories or globs under `path`. Evergreen scans each match, writes one combined JSON report and SARIF, and adds one job-summary section per package. `fail-on-severity` is evaluated across all packages together.

```yaml
- uses: actions/checkout@v7
- uses: arminazimi/evergreen@v0
  with:
    paths: |
      packages/*
      apps/web
    fail-on-severity: high
```

Literals must exist and be directories. A glob that matches nothing fails the Action. `*` and `?` stay inside one path segment; `**` crosses segments. Diff mode ignores `paths` and compares the whole pull request checkout instead.

High and critical findings become error annotations, medium findings become warnings, and low or informational findings become notices. The gate is evaluated independently from annotation level.

### Pull request comment

Set `pr-comment: true` to get one comment on the pull request with the counts per severity and the top findings, instead of reading every annotation. The same comment is updated on each re-run. The scan itself stays offline; only posting the comment calls the GitHub API.

```yaml
permissions:
  contents: read
  pull-requests: write
steps:
  - uses: actions/checkout@v6
  - uses: arminazimi/evergreen@v0
    with:
      pr-comment: "true"
```

Pull requests from forks get a read-only token, so the comment cannot be posted there: the Action logs a warning and the scan result is unaffected.

### Comment commands

Set `commands: "true"` and run the Action on `issue_comment` so a reviewer can ask about a finding or accept it without leaving the pull request. A short workflow of its own is enough; it can sit next to the scan workflow:

```yaml
name: Evergreen commands

on:
  issue_comment:
    types: [created]

permissions:
  contents: read
  pull-requests: write

jobs:
  answer:
    if: github.event.issue.pull_request != null
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          ref: refs/pull/${{ github.event.issue.number }}/head
      - uses: arminazimi/evergreen@v0
        with:
          commands: "true"
```

`/evergreen explain <finding-id>` replies with the finding, its location, replacement and deadline, the affected usages, and a link to every source. Take the id from an annotation's `Finding:` line, or from `evergreen scan . --json`.

`/evergreen ignore <finding-id> <reason>` replies with a baseline entry that is ready to review and commit, for example:

```json
{ "fingerprint": "…", "ruleId": "nodejs.runtime.eol-20", "path": "package.json",
  "reason": "Upgrade tracked in PLAT-12", "created": "2026-10-29", "expires": "2027-01-27" }
```

Nothing is pushed. The reviewer adds the entry to the file named by the `baseline` input (`.evergreen-baseline.json` when it is empty) and commits it. The entry hides the finding until `expires`, 90 days after the reply; after that the finding is reported again, and `on-expired: fail` fails the job as well.

Comment text is untrusted input. Evergreen reads the first line that starts with `/evergreen`, parses it, and never evaluates it; file paths and ids from the comment are rendered as code, never as links. A reply is written only when the comment's `author_association` is `OWNER`, `MEMBER`, or `COLLABORATOR`; a command from anyone else, or a comment on an issue rather than a pull request, is skipped and logged as a notice. The finding comes from a local scan of the checked-out pull request head, so the scan stays offline and runs no repository code. Each reply carries a hidden marker and is updated on a re-run instead of being posted twice.

## Lifecycle tracking issue

Set `tracking-issue: true` to keep one issue that lists what ends soon, without gating a build. On `schedule` and `workflow_dispatch` runs the Action finds the issue by a hidden marker, updates it, or creates it. Findings are sorted by end-of-life date with a link to the exact file and line, and a "Changed since the last run" table names what appeared and what is gone. When a scan finds nothing, the issue closes with an explanatory body; the next run that finds a lifecycle risk reopens it.

```yaml
name: Evergreen lifecycle tracking
on:
  schedule:
    - cron: "0 7 * * 1" # Mondays 07:00 UTC
  workflow_dispatch:
permissions:
  contents: read
  issues: write
concurrency:
  group: evergreen-tracking-issue
  cancel-in-progress: false
jobs:
  track:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: arminazimi/evergreen@v0.7.1
        with:
          tracking-issue: "true"
          fail-on-severity: none # the issue is the signal; do not fail the schedule
```

The marker is a hidden HTML comment, so the issue body stays readable and a re-run recognizes its own issue. The previous run's findings live in another hidden marker; that snapshot is how the next run says what changed. Do not edit or delete the markers: without them the next run creates a new issue. The scan stays offline; only updating the issue calls the GitHub API, and the job needs `issues: write`. Pull request tokens are read-only, so the input acts only on `schedule` and `workflow_dispatch` runs.

The Action looks for its issue among the 1,000 most recently updated issues. On a repository with more issue activity than that while the tracking issue is closed, it can fall outside the window and a second issue is created; delete one and the next run updates the other. GitHub caps issue bodies at 65,536 characters, so the findings table is shortened when needed while the hidden snapshot keeps tracking every finding; if even the shortened body would exceed the cap, the Action logs a warning and leaves the issue unchanged.

## Pull request diff mode

`finding-count` and the severity gate cover every finding in the checkout. On a busy repository that backlog grows, so reviewers cannot see which findings a pull request actually introduced. `mode: diff` fixes that: the Action scans the pull request base and head refs with the same engine as `evergreen diff`, and the gate, annotations, badge, comment, and summary count only what the pull request introduced. Findings the pull request fixes are listed in a "Fixed by this pull request" table in the summary and the pull request comment.

```yaml
steps:
  - uses: actions/checkout@v7
    with:
      fetch-depth: 0   # diff mode archives the base and head SHAs from git objects, so fetch their history
  - uses: arminazimi/evergreen@v0
    with:
      mode: diff
```

The base and head come from the `pull_request` event payload (`pull_request.base.sha` and `pull_request.head.sha`); the comparison stays offline — both refs are unpacked with `git archive` and scanned locally. Outside a `pull_request` event, or when the payload lacks those SHAs, the Action logs a notice and runs a regular scan instead. The baseline input does not apply in diff mode: it describes accepted findings in the whole repository, not in one pull request, and the Action says so with a notice. Because the gate judges only introduced findings, a pull request that adds a deprecated package fails and one that only edits documentation passes.

Annotations on untouched files are noise, so diff mode annotates only findings on lines the pull request added or changed and counts the others in one summary line with a link to the full report. The gate, the severity counts, the badge, the comment, and the JSON report still cover every introduced finding. Set `annotations: all` to annotate every introduced finding, or `annotations: none` to emit no annotations at all. Scan mode defaults to `all`; an explicit `annotations: changed` there falls back to `all` with a notice because there is no pull request range.

### Suggested fixes

Set `suggest-fixes: true` with `mode: diff` to let a reviewer accept a fix with one click instead of reading migration notes. For findings on lines the pull request added or changed that `evergreen fix` can repair deterministically, the Action posts one review whose comments each contain a `suggestion` block, so GitHub's **Apply suggestion** rewrites the line. Findings without a deterministic fix get no suggestion; the scan, the gate, and the report are unchanged.

```yaml
permissions:
  contents: read
  pull-requests: write
steps:
  - uses: actions/checkout@v7
    with:
      fetch-depth: 0   # diff mode archives the base and head SHAs from git objects
  - uses: arminazimi/evergreen@v0
    with:
      mode: diff
      suggest-fixes: "true"
```

A re-run updates the review it left instead of adding another: the review body and the comments on the same file and lines are rewritten, and comments whose suggestion no longer applies are deleted. A suggestion at a new line arrives as one more review, because GitHub does not allow adding comments to a submitted review. Pull requests from forks get a read-only token, so the Action logs a notice and posts nothing. The scan itself stays offline; only posting the review calls the GitHub API.

## End-of-life reminder issue

[`examples/lifecycle-watch.yml`](https://github.com/arminazimi/evergreen/blob/main/examples/lifecycle-watch.yml) is a copyable starter that reminds a team before a deadline without anyone running a scan. Copy it to `.github/workflows/lifecycle-watch.yml`. Every Monday (and on demand) it scans with `min-support-days`, then opens one issue listing each line whose support ends within `WINDOW_DAYS` (default 90). The next run updates that same issue instead of opening another, and closes it when nothing is near its deadline.

The scan stays offline; only the final step calls the GitHub API. The job needs `contents: read` and `issues: write`, and sets `fail-on-severity: none` so the schedule does not fail. Change `WINDOW_DAYS` or the cron line to taste.

## Scheduled fix pull request

Dependabot, but for end of life. Set `fix-pr: true` on a scheduled workflow and the Action keeps one pull request that contains every fix Evergreen can apply deterministically, the same patches `evergreen fix` prints. It commits them to `evergreen/fixes`, force-pushes the branch, and opens or updates that pull request. The body lists each fix with its exact location and the evidence it cites. When a run finds nothing left to fix, it closes the pull request instead of opening an empty one.

```yaml
name: Evergreen fixes

on:
  schedule:
    - cron: "0 6 * * 1" # Mondays 06:00 UTC
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

concurrency:
  group: evergreen-fixes
  cancel-in-progress: false

jobs:
  fixes:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: arminazimi/evergreen@v0.7.1
        with:
          fix-pr: "true"
          fail-on-severity: none
```

Every run force-pushes `evergreen/fixes`, and the pull request is found by its head branch rather than by title or body, so running twice updates the same pull request. A fixer that cannot apply a change exactly leaves that finding alone: the pull request contains only the patches that were applied. Review the pull request as you would any other; Evergreen never merges it and never touches the default branch.

`fix-pr` runs only on `schedule` and `workflow_dispatch` events. On any other event the Action logs a notice and leaves the repository alone, so a pull request from a fork, whose token is read-only, never tries to push. The scan itself stays offline: only the `git push` and the GitHub API calls that create, update, or close the pull request use the network, after the scan has finished. The job needs `contents: write` to push the branch and `pull-requests: write` to manage the pull request.

See it working on a schedule in [evergreen-action-sample](https://github.com/arminazimi/evergreen-action-sample): it keeps one fix pull request and one tracking issue current every Monday.

## Permissions and privacy

Only `contents: read` is required. Evergreen does not need `pull-requests: write` unless you set `pr-comment: true`, `commands: true`, or `suggest-fixes: true`; it then writes one pull request comment, command reply, or review of suggestions, each found again by a hidden marker and updated on every re-run, and needs only `pull-requests: write` for that. Evergreen does not send repository contents to an Evergreen backend. Annotations are emitted through runner workflow commands. `tracking-issue: true` needs `issues: write`; it updates one issue, also found by a hidden marker, and touches nothing else. With `fix-pr: true` it also needs `contents: write` (to push `evergreen/fixes`) and `pull-requests: write` (to open, update, or close the fix pull request).

The bundled scan is local and deterministic. When `upload-report` is `true`, the official `actions/upload-artifact` adapter sends `evergreen-report.json` to GitHub and retains it for 14 days. The report can contain repository-relative paths, matched source excerpts, dependency versions, and lifecycle evidence. Repository administrators should apply normal Actions artifact access controls or disable uploading for sensitive repositories.

Forked pull requests receive the same read-only scan behavior; no repository secrets are required.

## README badge

Set `upload-badge: true` to generate `evergreen-badge.json` and `evergreen-badge.svg` and upload the
`evergreen-badge` artifact, even when the severity gate fails. The `badge-path`
output lets a later step publish the same file. This is opt-in and does not grant
the Action write access or make network requests during the scan.

The badge reads `evergreen | clean`, or `evergreen | 3 high` when findings remain.
The message counts findings **after baseline comparison** and names the highest
remaining severity. It does not say a repository is risk-free: suppressed findings
are excluded, and the severity gate can pass while lower-severity findings remain.
`stale` means the lifecycle data is old (appended as `· stale` when findings remain),
and `expired` means a baseline suppression expired under `on-expired: fail`. Colors
come from the Evergreen palette: Verified Green for clean, muted amber for low and
medium, red for high and critical.

`evergreen-badge.svg` is the finished badge with the Evergreen mark. The
[Shields.io endpoint format](https://shields.io/badges/endpoint-badge) file,
`evergreen-badge.json`, holds `schemaVersion`, `label`, `message`, `color`, and
`labelColor`, for use with `img.shields.io/endpoint` when you want a different
Shields style.

Actions artifacts require authentication, so their download URLs cannot be used
as public Shields endpoints. For a public README, publish the JSON to a public
URL, such as a dedicated branch in a public repository. This example reserves
the `evergreen-badge` branch for the generated file; only trusted pushes to `main`
and manual runs on `main` may publish. No pull-request code gets a write token.
Use the default branch name of your repository if it is different.

```yaml
name: Evergreen badge
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: write
concurrency:
  group: evergreen-badge
  cancel-in-progress: false
jobs:
  badge:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      # Until the next release, pin a reviewed commit containing upload-badge.
      - uses: arminazimi/evergreen@main
        id: scan
        with:
          upload-badge: true
      - name: Publish aggregate badge data
        if: always() && steps.scan.outputs.badge-path != ''
        env:
          BADGE_PATH: ${{ steps.scan.outputs.badge-path }}
          BADGE_SVG_PATH: ${{ steps.scan.outputs.badge-svg-path }}
          GH_TOKEN: ${{ github.token }}
        shell: bash
        run: |
          publish=$(mktemp -d)
          git init "$publish"
          git -C "$publish" remote add origin "$GITHUB_SERVER_URL/$GITHUB_REPOSITORY.git"
          # GitHub CLI is preinstalled on ubuntu-latest.
          gh auth setup-git
          if git -C "$publish" ls-remote --exit-code --heads origin evergreen-badge; then
            git -C "$publish" fetch --depth=1 origin evergreen-badge
            git -C "$publish" checkout -b evergreen-badge FETCH_HEAD
          else
            git -C "$publish" checkout --orphan evergreen-badge
          fi
          cp "$BADGE_PATH" "$publish/evergreen-badge.json"
          cp "$BADGE_SVG_PATH" "$publish/evergreen-badge.svg"
          git -C "$publish" config user.name github-actions[bot]
          git -C "$publish" config user.email 41898282+github-actions[bot]@users.noreply.github.com
          git -C "$publish" add evergreen-badge.json evergreen-badge.svg
          if ! git -C "$publish" diff --cached --quiet; then
            git -C "$publish" commit -m "chore: update Evergreen badge"
            git -C "$publish" push origin HEAD:evergreen-badge
          fi
```

Then add this to the README, replacing `OWNER` and `REPO`:

```markdown
[![Evergreen lifecycle findings](https://raw.githubusercontent.com/OWNER/REPO/evergreen-badge/evergreen-badge.svg)](https://github.com/OWNER/REPO/actions)
```

Shields and GitHub cache badge images, so updates can take time to appear. The
badge describes the last published scan, not the latest commit or a guarantee of
freshness. A scan that cannot complete emits no new badge; its workflow failure
remains the authoritative status. Schedule trusted scans if you need regular
refreshes. Publishing aggregate counts makes them public; private repositories
can keep the artifact private or deliberately publish only this aggregate file.

## Code scanning

Set `upload-sarif: true` to show findings in the repository's **Security → Code scanning** tab. The Action writes the same findings as SARIF 2.1.0 and hands the file to `github/codeql-action/upload-sarif` under the category `evergreen`. The job needs one more permission:

```yaml
permissions:
  contents: read
  security-events: write

steps:
  - uses: actions/checkout@v7
  - uses: arminazimi/evergreen@v0.7.1
    with:
      upload-sarif: true
```

The token of a pull request from a fork is read-only, so the upload would fail there. Enable it for pushes and for pull requests from the same repository, for example `upload-sarif: ${{ github.event_name == 'push' }}`. Code scanning is free for public repositories and needs GitHub Code Security on private ones. The SARIF carries only locations and Evergreen's own rule text, not source content; the mapping is below.

### SARIF output

The same SARIF is available from the CLI, so other CI systems and editors can read it:

```bash
evergreen scan . --format sarif > evergreen.sarif
```

Output is deterministic: rules and results are sorted, paths are repository-relative with forward slashes on every platform, and neither the scan time nor the checkout path is written. Two scans of the same commit produce identical files.

| SARIF | Evergreen |
| --- | --- |
| `tool.driver.name`, `version` | `Evergreen` and the installed version |
| `rules[].id`, `name` | The lifecycle rule id, for example `github-actions.checkout.node20` |
| `rules[].shortDescription` | The rule title |
| `rules[].help` (`text` and `markdown`) | Replacement, deadline, migration steps, verification commands, and sources |
| `rules[].helpUri` | The first evidence source |
| `rules[].defaultConfiguration.level` | The same level mapping as `results[].level`, for the rule's severity |
| `rules[].properties.tags` | `lifecycle` and the detector id |
| `results[].ruleId`, `ruleIndex` | The finding's rule |
| `results[].level` | `critical` and `high` → `error`; `medium` → `warning`; `low` and `info` → `note` |
| `results[].message.text` | The finding summary, which names the exact reference, such as `actions/checkout@v3` |
| `results[].locations[]` | File path (`uriBaseId` `%SRCROOT%`) and `startLine` when the finding has a line |
| `results[].partialFingerprints["evergreenFindingId/v1"]` | The finding id, so alerts keep their identity between runs |

JSON, text, annotations, and SARIF are renderings of the same findings. A finding suppressed by a baseline is absent from all of them.

**Privacy.** SARIF contains no source code: only file paths, line numbers, and Evergreen's own rule text and evidence links. It is uploaded only when `upload-sarif` is `true`, and then only to GitHub code scanning in the same repository. Nothing is sent to an Evergreen service.
{% endraw %}
