# Security policy

## Supported versions

Security fixes are provided for the latest published release.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository. Do not open a public issue containing exploit details, private source code, credentials, or tokens.

Include the affected version, impact, reproduction, and any suggested mitigation. You should receive an acknowledgement within seven days.

## Trust model

Evergreen treats scanned repository contents as untrusted data. Core scans run locally, registry entries are data rather than executable plugins, and the MCP server uses local stdio. Migration verification commands are suggestions and are never executed by Evergreen automatically. Review commands and code changes under the normal authorization policy of your environment.

## OpenSSF Scorecard

[`.github/workflows/scorecard.yml`](.github/workflows/scorecard.yml) runs OpenSSF Scorecard weekly, on every push to `main`, and on branch-protection changes. It publishes results to the Scorecard API and uploads SARIF to GitHub code scanning. Actions in that workflow are pinned to full commit SHAs, and the job uses the minimum token permissions Scorecard needs (`contents: read`, `security-events: write`, `id-token: write`).

Existing workflows already declare top-level read permissions (or empty permissions) and SHA-pin third-party actions, except where noted below. Checks that stay below 7 on purpose, or that need a maintainer setting rather than a repository file change:

| Check | Why it is not raised further |
|---|---|
| Branch-Protection | `main` requires the CI and self-scan status checks and conversation resolution. Required approving reviews stay at zero so agent and maintainer pull requests can merge after green checks; code-owner review is configured in `.github/CODEOWNERS` but not enforced as a hard gate. Admin-only Scorecard fields need a PAT the workflow does not store. |
| Code-Review | Same as Branch-Protection: human review is expected for lifecycle evidence and public contracts via CODEOWNERS, but a required review count is not enforced on every merge. |
| Pinned-Dependencies | GitHub Actions and Docker steps used in CI are SHA-pinned. The SLSA reusable workflow in `release.yml` stays on the upstream `v2.1.0` tag because that is how [`slsa-framework/slsa-github-generator`](https://github.com/slsa-framework/slsa-github-generator) documents calling it. |
| Token-Permissions | Workflows use read-only (or empty) top-level permissions and grant write only on the jobs that need it. |
| Dependency-Update-Tool | Dependabot and Renovate are not enabled yet. npm dependencies are few and reviewed when changed; a follow-up can add an updater if that trade-off changes. |
| SAST | No separate CodeQL analyze workflow. Scorecard SARIF upload and Evergreen's own CI SARIF dogfood are the static signals this repository runs today. |
| Fuzzing | Not applicable: Evergreen is a local scanner over manifests and source text, not a network-facing parser farm. |
| CII-Best-Practices | Tracked separately as the OpenSSF Best Practices badge work. |
