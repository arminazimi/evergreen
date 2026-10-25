# GitLab

Evergreen ships a GitLab CI/CD component, [`templates/evergreen.yml`](../templates/evergreen.yml). It adds one job that scans the checked-out repository, keeps the JSON report as a job artifact, and fails the pipeline at a severity gate. Its inputs mirror the [GitHub Action](GITHUB_ACTION.md): `path`, `baseline`, `baseline_warn_days`, `on_expired`, `min_support_days`, and `fail_on_severity` have the same meanings and defaults.

## Add the job

```yaml
include:
  - component: $CI_SERVER_FQDN/<group>/<project>/evergreen@<version>
    inputs:
      baseline: .evergreen-baseline.json
      fail_on_severity: high
```

`<group>/<project>` is the project that hosts the component on your GitLab instance. The `version` input pins the `evergreen-deprecation` npm package the job runs; it defaults to the version the component was released with.

## Permissions

The job needs nothing beyond the default pipeline permissions:

- It reads the files GitLab checks out for the job. It uses a shallow clone (`GIT_DEPTH: "1"`).
- It uses no access token, project or group variable, or secret, and does not call the GitLab API.
- It writes one file, the report (`evergreen-report.json` unless you set `report_name`), kept as a job artifact for 14 days even when the gate fails.
- It never edits the repository, opens a merge request, or runs a migration command.

## Network behavior

Scans make no network requests: the detectors read repository files and the lifecycle data bundled in the package. The job still needs the network twice, before the scan starts:

| When | What | Where it goes |
| --- | --- | --- |
| The runner starts the job | Pulls the `image` input (default `node:24-trixie-slim`) | Your runner's container registry |
| The job runs `npx` | Downloads `evergreen-deprecation@<version>` and its dependencies | The npm registry your runner is configured for |

Neither request carries repository contents. Repository contents and findings stay on the runner; the report leaves it only as a GitLab job artifact.

## Self-managed GitLab

- **Hosting the component.** Put the component in a project on your instance, mirroring `templates/evergreen.yml`, and reference it with `$CI_SERVER_FQDN` as above. Components and `$[[ inputs.* ]]` interpolation need a GitLab version that supports CI/CD components; check your instance's release notes.
- **No access to Docker Hub.** Mirror a Node.js 22 or newer image into your own registry and pass it as `image`.
- **No access to the public npm registry.** Point npm at your internal registry or proxy, for example with an `NPM_CONFIG_REGISTRY` CI/CD variable, and make sure it serves `evergreen-deprecation` at the pinned version.
- **Air-gapped runners.** Bake the package into the image and set `version` to match. The job's `npx --yes` call then finds it locally, and the scan itself already needs no network.
- **Lifecycle data.** The job does not run `evergreen data update`, so it never fetches newer rules from GitHub. To change the rules a pipeline uses, change the `version` input. See [Lifecycle data](DATA.md).

## Gate and baseline

The job exits with the gate's status after writing the report, so the report is available when the job fails. Accept existing findings with a baseline committed to the repository, and set `baseline` to its path relative to `path`; the format, expiry warnings, and `on_expired` behavior are the same as in the [GitHub Action](GITHUB_ACTION.md). See also [Privacy](PRIVACY.md).
