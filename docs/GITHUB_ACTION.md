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
      - uses: arminazimi/evergreen@v0.2.0
        with:
          baseline: .evergreen-baseline.json
          fail-on-severity: high
```

Version tags provide stable release references. Pin a full commit SHA when your threat model requires immutable third-party action references.

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

## Inputs and outputs

Every input is optional. The values below are the defaults used when a workflow
does not provide a `with` entry.

| Input | Default | Meaning |
| --- | --- | --- |
| `path` | `.` | Repository root or subdirectory to scan; `.` is the checked-out repository. |
| `baseline` | empty | Baseline path relative to `path`. Empty reports every finding; a configured path that is missing fails the Action. |
| `baseline-warn-days` | `14` | Warn when a baseline suppression expires within this many days (0 to 365). |
| `on-expired` | `resurface` | What a baseline suppression does after its `expires` day: `resurface` (its finding is reported again) or `fail` (also fail the job). |
| `fail-on-severity` | `high` | Lowest failing level: `none`, `info`, `low`, `medium`, `high`, or `critical`. |
| `report-name` | `evergreen-report` | Artifact name for the JSON report when `upload-report` is `true`. |
| `upload-report` | `true` | Upload the JSON report as an Actions artifact. `false` keeps the generated report only on the runner. |
| `upload-sarif` | `false` | Set to `true` to upload the findings to GitHub code scanning as SARIF. Needs `security-events: write`. |
| `attribution` | `true` | Adds one line to the job summary saying the scan was done by Evergreen, with a link. Set to `false` to leave it out. |

| Output | Availability | Meaning |
| --- | --- | --- |
| `report-path` | Always | Absolute runner path to the generated JSON report, whether or not `upload-report` is enabled. |
| `finding-count` | Always | Number of findings remaining after baseline comparison, encoded as a decimal string. |
| `sarif-path` | When `upload-sarif` is `true` | Absolute runner path to the generated SARIF file; otherwise empty. |

The job summary shows how many findings there are per severity, the ten most severe findings with their location and a link to the evidence each one cites, the age of the lifecycle data, and a warning when the data is stale. When there are more than ten findings, it says how many more there are; the JSON report artifact lists them all.

High and critical findings become error annotations, medium findings become warnings, and low or informational findings become notices. The gate is evaluated independently from annotation level.

## Permissions and privacy

Only `contents: read` is required. Evergreen does not need `pull-requests: write`, does not post comments, and does not send repository contents to an Evergreen backend. Annotations are emitted through runner workflow commands.

The bundled scan is local and deterministic. When `upload-report` is `true`, the official `actions/upload-artifact` adapter sends `evergreen-report.json` to GitHub and retains it for 14 days. The report can contain repository-relative paths, matched source excerpts, dependency versions, and lifecycle evidence. Repository administrators should apply normal Actions artifact access controls or disable uploading for sensitive repositories.

Forked pull requests receive the same read-only scan behavior; no repository secrets are required.

## Code scanning

Set `upload-sarif: true` to show findings in the repository's **Security → Code scanning** tab. The Action writes the same findings as SARIF 2.1.0 and hands the file to `github/codeql-action/upload-sarif` under the category `evergreen`. The job needs one more permission:

```yaml
permissions:
  contents: read
  security-events: write

steps:
  - uses: actions/checkout@v7
  - uses: arminazimi/evergreen@v0.2.0
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
