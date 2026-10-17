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

`owner` and `reason` are non-empty text (up to 500 characters); `created` and `expires` are calendar dates (`YYYY-MM-DD`), and `expires` is not before `created`. An entry with a malformed field makes the baseline fail to load, with the entry's position in the message. The schema is [`schemas/baseline.v1.schema.json`](../schemas/baseline.v1.schema.json). Warnings before `expires` and what happens after it come in later changes; today the fields are recorded and validated only.

The Action then annotates and gates only findings not represented by that baseline.

## Inputs and outputs

| Input | Default | Meaning |
| --- | --- | --- |
| `path` | `.` | Repository or subdirectory to scan. |
| `baseline` | empty | Baseline path relative to `path`. Missing configured files fail the Action. |
| `fail-on-severity` | `high` | Lowest failing level: `none`, `info`, `low`, `medium`, `high`, or `critical`. |
| `report-name` | `evergreen-report` | Artifact name for the JSON report. |
| `upload-report` | `true` | Set to `false` to keep the report only on the runner. |
| `upload-sarif` | `false` | Set to `true` to upload the findings to GitHub code scanning as SARIF. Needs `security-events: write`. |
| `attribution` | `true` | Adds one line to the job summary saying the scan was done by Evergreen, with a link. Set to `false` to leave it out. |

The job summary shows how many findings there are per severity, the ten most severe findings with their location and a link to the evidence each one cites, the age of the lifecycle data, and a warning when the data is stale. When there are more than ten findings, it says how many more there are; the JSON report artifact lists them all.

`report-path` contains the local absolute JSON path, `finding-count` contains the post-baseline count, and `sarif-path` contains the SARIF file path when `upload-sarif` is `true`. High and critical findings become error annotations, medium findings become warnings, and low or informational findings become notices. The gate is evaluated independently from annotation level.

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
