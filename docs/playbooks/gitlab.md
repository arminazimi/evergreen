# Playbook: GitLab pipelines

A start-to-finish guide for running Evergreen in a GitLab pipeline: add the component, read what it reports, gate merges on severity, accept known findings with a baseline, and run it on a self-managed instance. For the component's inputs, permissions, and network behavior in full, see [GITLAB.md](../GITLAB.md). For fixing a finding by hand or with an agent, see [cli.md](cli.md) and [agent.md](agent.md).

## Before you start

- Find the GitLab version of your instance. CI/CD components and `$[[ inputs.* ]]` interpolation need a release that supports them. On GitLab.com they are available.
- Decide where the component lives. On GitLab.com, reference `gitlab.com/arminazimi/evergreen` through the CI/CD Catalog. On a self-managed instance, host a copy of `templates/evergreen.yml` in a project of your own (see [Self-managed GitLab](#self-managed-gitlab) below).
- Confirm the runner can pull a Node.js 22 or newer image and reach an npm registry that serves `evergreen-deprecation`. The job needs both before the scan starts.
- Run the scan once from a workstation before you gate on it, so you see the findings you are about to inherit. `npx evergreen-deprecation scan . --json` is the same scan the job runs.

## 1. Add the job

Add the component to `.gitlab-ci.yml`:

```yaml
include:
  - component: $CI_SERVER_FQDN/<group>/<project>/evergreen@<version>
    inputs:
      fail_on_severity: high
```

Pin `<version>` to a release. The component's `version` input decides which `evergreen-deprecation` package the job runs, and it defaults to the version the component shipped with. Pinning the component and leaving the default in place keeps the rules you tested and the rules the pipeline uses the same. To change the rules a pipeline uses, change the version, not the data: the job does not run `evergreen data update`.

The job runs in the `test` stage by default. Set `stage` if your pipeline names its stages differently.

## 2. Read the result

The job writes two files and keeps them as artifacts for 14 days, even when the gate fails:

| File | Input that names it | What it is for |
| --- | --- | --- |
| `evergreen-report.json` | `report_name` | The full JSON report. Use it for audits and scripts. |
| `gl-code-quality-report.json` | `code_quality_report_name` | The GitLab Code Quality report. GitLab shows its findings in the merge request. |

Open the merge request's Code Quality widget first. Each finding names its rule and file. Then open the job log: the human-readable summary lists the same findings with their replacements.

To reproduce a result locally, use the same version and gate as the job:

```bash
npx --yes evergreen-deprecation@<version> scan . --fail-on high
```

A local run and a pipeline run disagree only when the repository, the version, or the gate differs. If they disagree, compare the three before you assume a bug.

## 3. Gate the merge on severity

`fail_on_severity` is the lowest severity that fails the job. It defaults to `high`. The options are `none`, `info`, `low`, `medium`, `high`, and `critical`. `none` makes the job report without ever failing.

Start with the default, or with `none` while you learn what the repository contains. Move to `high` once the existing findings are either fixed or accepted in a baseline. Moving to `medium` or lower fails on findings a team may not yet have a plan for, so do it only after the backlog is clear.

When the job fails, the exit status is the gate's, and the reports are still there. Read the Code Quality widget, then pick the path:

- **Fix it by hand.** Follow [cli.md](cli.md) from the explain step.
- **Hand it to an agent.** Follow [agent.md](agent.md): one finding per branch, verified by the project's tests and a fresh scan.
- **It is wrong.** Do not work around it. Produce the report with `evergreen report-issue '<finding-id>' . --output issue.md` and file it.

## 4. Accept known findings with a baseline

A baseline is a file committed to the repository that lists findings you have accepted, each with an expiry date. Set `baseline` to its path relative to `path`:

```yaml
include:
  - component: $CI_SERVER_FQDN/<group>/<project>/evergreen@<version>
    inputs:
      baseline: .evergreen-baseline.json
      baseline_warn_days: "14"
      on_expired: fail
```

- `baseline_warn_days` warns when a suppression expires within that many days.
- `on_expired` decides what happens after the date. `resurface` reports the finding again. `fail` also fails the job, so an accepted risk cannot quietly stay accepted past its date.

The baseline format and expiry behavior are the same as in the [GitHub Action](GITHUB_ACTION.md). Review every baseline change in the merge request like any other code change: a new suppression is an accepted risk, and it should carry a reason and a date a person chose.

To warn before a finding's support ends, set `min_support_days`. Leave it empty to report only what the data already marks.

## 5. Run it on a self-managed instance

Self-managed runners often cannot reach Docker Hub or the public npm registry. Work through these, in order:

1. **Host the component.** Copy `templates/evergreen.yml` into a project on your instance. Reference it with `$CI_SERVER_FQDN` as in step 1.
2. **Mirror the image.** Copy a Node.js 22 or newer image into your registry and set the `image` input to it.
3. **Point npm at your registry.** Set `NPM_CONFIG_REGISTRY` as a CI/CD variable so `npx` finds `evergreen-deprecation` at the pinned version on your proxy.
4. **Or bake the package in.** On an air-gapped runner, put `evergreen-deprecation` in the image and set `version` to match. The job's `npx --yes` call then uses the local copy. The scan itself never needed the network.

Keep the component version and the package version identical. A mismatch runs a rule set you did not choose.

## Failure modes

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| Job fails before any scan output | The runner cannot pull `image`, or `npx` cannot download the package | Mirror the image or configure the npm registry. Step 5. |
| No report artifact after a failed job | The job stopped before the scan ran, so nothing was written | Read the job log from the top. Reports exist only once the scan has run. |
| The job passes, but a `.gitlab-ci.yml` image is end-of-life | Image values in CI files are reported as unclassified, never as findings | Treat it as unknown, not safe. Check the image with `evergreen check` or read [COMPATIBILITY.md](../COMPATIBILITY.md). |
| A baseline entry does not suppress a finding | The `baseline` path is relative to `path`, not the repository root, or the finding's rule or location changed | Check the path in the job log. Re-run the scan to get the current finding ID. |
| A suppression fails the job after its date | `on_expired: fail` is working as designed | Fix the finding, or extend the suppression with a reason in a reviewed merge request. |

## Privacy boundaries

- The job uses no access token, project or group variable, or secret, and makes no GitLab API call. It never edits the repository or opens a merge request.
- The scan makes no network requests. The only network use is the image pull and the npm download, and neither carries repository contents.
- The reports leave the runner only as job artifacts. They name the files and lines where findings occur, so treat them as project metadata: anyone who can read the job's artifacts can read them. Check the project's visibility settings before you rely on the report staying private.
- Artifacts expire after 14 days. Download anything you need to keep.

## Worked example: this repository

Evergreen's own [`.gitlab-ci.yml`](../../.gitlab-ci.yml) tests the component on every pipeline. Start from it when you need a known-good pipeline: it shows the component reference, the inputs, and the stages a passing run uses.

To check the job before you trust it, run the same commands it runs against a repository with a known finding, then confirm that the Code Quality file lists it and that the exit status matches the gate.
