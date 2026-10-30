# Security policy

## Supported versions

Security fixes are provided for the latest published release.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository. Do not open a public issue containing exploit details, private source code, credentials, or tokens.

Include the affected version, impact, reproduction, and any suggested mitigation. You should receive an acknowledgement within seven days.

## Trust model

Evergreen treats scanned repository contents as untrusted data. Core scans run locally, registry entries are data rather than executable plugins, and the MCP server uses local stdio. Migration verification commands are suggestions and are never executed by Evergreen automatically. Review commands and code changes under the normal authorization policy of your environment.

Lifecycle evidence travels through a signed [data channel](docs/DATA.md): each release ships rules in the package; between releases you can fetch newer rules only by running `evergreen data update` yourself. Bundles are Sigstore-signed, verified offline against a trusted root that ships in the package, and refused (with a fallback to the bundled rules) when verification fails. You can pin an exact bundle for reproducible CI. There is no Evergreen-operated backend and no account. The [threat model](docs/THREAT_MODEL.md) records what each surface trusts; the [command and surface access](docs/PRIVACY.md#command-and-surface-access) table lists every capability.

The published package can read the filesystem, read environment variables, spawn child processes (including local `git` and, for `guard`, a package manager), and make outbound HTTP requests. Scans and the local MCP server use none of the network path. In short:

- **Network:** `evergreen data update` (signed public releases you opt into) and, in the GitHub Action only, an optional pull-request comment via the GitHub API when `pr-comment` is enabled. The GitLab CI/CD component never calls an API. Package install (`npm` / `npx`) is outside the scan path.
- **Child processes:** local `git` / `tar` for `diff` and `fix --branch`, optional local `git remote get-url` for `badge --snippet` when `--repo` is omitted, hook/path helpers for `init`, optional editor spawn for interactive scan, fixed version probes for `doctor --system`, and the package manager `guard` runs after a passing check.
- **Filesystem and env:** reading the authorized repository is the product; writes and env reads are limited to the rows in that table (baselines, status files, caches, agent instruction files, proxies, and data-pin variables).

## OpenSSF Scorecard

[`.github/workflows/scorecard.yml`](.github/workflows/scorecard.yml) runs OpenSSF Scorecard weekly, on every push to `main`, and on branch-protection changes. It publishes results to the Scorecard API and uploads SARIF to GitHub code scanning. Actions in that workflow are pinned to full commit SHAs, and the job uses the minimum token permissions Scorecard needs (`contents: read`, `security-events: write`, `id-token: write`).

[`.github/workflows/codeql.yml`](.github/workflows/codeql.yml) runs CodeQL static analysis on `main` every week and on demand, covering the JavaScript and TypeScript source that makes up the package, CLI, MCP server, and Action. It uploads SARIF to GitHub code scanning alongside the Scorecard and Evergreen results, with the same SHA-pinned actions and a job-level `security-events: write` permission.

Dependabot keeps npm dependencies and SHA-pinned Actions current, configured in [`.github/dependabot.yml`](.github/dependabot.yml). Its pull requests run the same `npm run check` and review as any other change.

Existing workflows already declare top-level read permissions (or empty permissions) and SHA-pin third-party actions, except where noted below. Checks that stay below 7 on purpose, or that need a maintainer setting rather than a repository file change:

| Check | Why it is not raised further |
|---|---|
| Branch-Protection | `main` requires the `ci-ok` status check and conversation resolution. Required approving reviews stay at zero so agent and maintainer pull requests can merge after green checks; code-owner review is configured in `.github/CODEOWNERS` but not enforced as a hard gate. Admin-only Scorecard fields need a PAT the workflow does not store. |
| Code-Review | Same as Branch-Protection: human review is expected for lifecycle evidence and public contracts via CODEOWNERS, but a required review count is not enforced on every merge. |
| Pinned-Dependencies | GitHub Actions and Docker steps used in CI are SHA-pinned. The SLSA reusable workflow in `release.yml` stays on the upstream `v2.1.0` tag because that is how [`slsa-framework/slsa-github-generator`](https://github.com/slsa-framework/slsa-github-generator) documents calling it. |
| Token-Permissions | Workflows use read-only (or empty) top-level permissions and grant write only on the jobs that need it. |
| Fuzzing | Not applicable: Evergreen is a local scanner over manifests and source text, not a network-facing parser farm. |
| CII-Best-Practices | Tracked separately as the OpenSSF Best Practices badge work. |
