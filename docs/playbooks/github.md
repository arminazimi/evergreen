# Playbook: GitHub Actions

A start-to-finish guide for running Evergreen in GitHub Actions: add the Action to a pull request, read what it reports, accept what you must on purpose, and keep the gate honest over time. For a repository you check by hand, see [cli.md](cli.md). For agent-driven fixes, see [agent.md](agent.md).

## Before you start

- Confirm your workflow runs on a runner that still has the Node.js and action runtimes you use. Evergreen flags those too, so a workflow that installs an end-of-life runtime shows up in its own scan.
- Pick a version tag, such as `arminazimi/evergreen@v0.6.1`, and read the inputs table in [GITHUB_ACTION.md](../GITHUB_ACTION.md#inputs-and-outputs). Every input is optional; the defaults gate on `high` and upload the JSON report.
- Decide what the team accepts before the first run. Existing findings should go into a committed baseline, not into a gate that is switched off.
- Work on a branch. Run the Action on a pull request first, read the annotations, then make it required.

## The pull-request loop

### 1. Add the workflow

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
      - uses: arminazimi/evergreen@v0.6.1
        with:
          baseline: .evergreen-baseline.json
          fail-on-severity: high
```

`contents: read` is the only permission the scan needs. The scan reads the checked-out files and bundled data; it makes no network requests and sends no repository contents to an Evergreen service.

Pin a full commit SHA instead of a tag only when your threat model requires immutable references. A SHA pin with a trailing `# vX.Y.Z` comment is classified from that comment; a SHA without one is looked up in the bundled map, and an unknown one is reported as `unknown-sha` rather than guessed ([GITHUB_ACTION.md](../GITHUB_ACTION.md#sha-pinned-actions)).

### 2. Read the annotations

High and critical findings become error annotations on the file and line; medium findings become warnings; low and informational findings become notices. The job summary lists the counts per severity, the ten most severe findings, and the age of the lifecycle data.

A real finding from a public repository, at a pinned commit of `axios/axios`:

```text
nodejs.runtime.legacy:.github/workflows/release-branch.yml:72  critical  Node.js 22 LTS or later
```

The matrix on that line installs Node.js 12 with `actions/setup-node`. Run the same explanation locally before you change anything:

```bash
evergreen explain 'nodejs.runtime.legacy:.github/workflows/release-branch.yml:72' .
```

The output names the rule, the exact location, and the authoritative source. Open the source yourself. Then read the migration packet with `evergreen context` and make the change in the workflow, not in the scan.

Actions themselves are judged too. `evergreen check pkg:github/actions/setup-node@v3` reports that release as high, because it predates the action's Node.js 24 runtime, and names `actions/setup-node@v5` or later as the replacement. Bump the action, re-run the workflow, and confirm the annotation is gone.

### 3. Fix, then re-run

Change the workflow, let the project's own CI run, then confirm the rule no longer appears at that location on the pull request. Compare the rule and the path, not only the finding ID: line numbers move when a workflow is edited.

## Accepting a finding on purpose

Some findings cannot be fixed in this pull request: a matrix that a downstream consumer still tests, or a vendor action that has not shipped its replacement. Record the decision in the repository:

```bash
evergreen baseline . --output .evergreen-baseline.json
```

Commit the file so the acceptance is reviewable. Each entry can carry an `owner`, a `reason`, and an `expires` date. Add them for every accepted finding; a suppression without an owner is one nobody will revisit.

```bash
evergreen scan . --baseline .evergreen-baseline.json --on-expired fail
```

With `on-expired: fail`, the job fails once a suppression's `expires` day has passed, so acceptance cannot quietly become permanent. `baseline-warn-days` (default 14) puts the upcoming expiries in the job's diagnostics before that happens. Do not add a finding to the baseline that you have not read.

## Scheduled reminders

A pull-request check only reports what a change touches. A runtime that ends next quarter will not fail anyone's pull request until it is too late. The repository's [lifecycle-watch example](../../examples/lifecycle-watch.yml) runs weekly, scans with `min-support-days`, and keeps one issue up to date with every line whose support ends within the window. It needs `contents: read` and `issues: write`, and it sets `fail-on-severity: none` so the schedule itself never fails.

## Failure modes and what to do

| What goes wrong | Why | Response |
| --- | --- | --- |
| The job fails with no finding in the summary | `baseline` is set to a path that does not exist, which fails the Action on purpose | Commit the baseline file, or remove the input |
| `pr-comment` does nothing | The comment needs `pull-requests: write` and the token to post it | Add the permission, or leave `pr-comment` off and read the annotations |
| `upload-sarif` fails | Code scanning needs `security-events: write` | Add the permission, or keep `upload-sarif` at `false` |
| Results differ between a runner and a laptop | Different bundled data versions | Compare the data date in the job summary with `evergreen data status` locally |
| `unknown-sha` on an action pin | The SHA is not in the bundled release-tag map | Pin with a trailing `# vX.Y.Z` comment, or check the action by hand; it is not a lifecycle finding and does not gate the job |
| A new scan fails a workflow nobody touched | A runtime or action reached its end-of-life deadline | That is the point of the gate. Fix it in a pull request, or accept it in the baseline with an owner and a date |

## Privacy and permissions

- Only `contents: read` is required. Add `pull-requests: write` only for `pr-comment: true`, and `security-events: write` only for `upload-sarif: true`.
- The JSON report is uploaded as an Actions artifact for 14 days when `upload-report` is `true`. It can contain repository paths, matched source excerpts, dependency versions, and lifecycle evidence. Anyone with access to the repository's Actions artifacts can read it, so turn off `upload-report` for sensitive repositories, or restrict who can read artifacts.
- Scan output also appears in job summaries and PR comments. Read it before enabling `pr-comment` on a public repository.
- The scan runs on the code in the pull request. Evergreen parses repository files and never executes them, but the workflow itself runs whatever the pull request changes, so keep `pull_request_target` out of workflows that check out untrusted code.

## Checklist for a new repository

1. The workflow sets `permissions:` explicitly, with `contents: read` as the base.
2. The first run is on a pull request, and every annotation has been opened or explained.
3. Existing findings are in a committed baseline, each with an `owner`, a `reason`, and an `expires` date.
4. `on-expired: fail` is set, so an expired acceptance fails the job.
5. The scheduled reminder workflow is running, if the repository ships on a long cycle.
6. A pull request that fixes a finding shows the annotation gone, and the project's own tests pass.
