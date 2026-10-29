# Slipway starter kit files

Copy-paste files for a Jekyll site that builds and deploys with GitHub Pages, the shape Slipway ships. Drop them into the site repository at the same paths.

| Path in this directory | Destination in your project |
| --- | --- |
| `.evergreen.json` | `.evergreen.json` |
| `.github/workflows/evergreen.yml` | `.github/workflows/evergreen.yml` |

## What it checks

| Surface | Evidence | Why it matters for a Slipway site |
| --- | --- | --- |
| Ruby runtime | `.ruby-version`, `.tool-versions`, the `Gemfile` `ruby` directive, and `Gemfile.lock` `RUBY VERSION` | GitHub Pages builds with a Ruby line that must still receive fixes. |
| Ruby gems | `Gemfile.lock` resolved gems | A yanked or abandoned gem breaks the Pages build, not the next release of the site. |
| GitHub Actions | `uses:` pins in `.github/workflows/*.yml`, including the Pages workflow | Retired Action runtimes fail when GitHub removes them, not when the site changes. |

Scans are offline: the workflow and the CLI read the repository and the lifecycle rules bundled with the pinned Action release. The config ignores generated output (`_site/`), Bundler's state (`.bundle/`, `vendor/`), and Jekyll's cache, so a finding always points at content you maintain.

## Setup

1. Copy `.evergreen.json` and `.github/workflows/evergreen.yml` into the site repository.
2. Commit both files. The workflow runs on every pull request and on pushes to `main`, and fails the job on a `high` or `critical` finding.
3. If the site already has accepted findings, write a baseline once and reference it from the workflow and the config:

   ```bash
   npx evergreen-deprecation baseline . --output .evergreen-baseline.json
   ```

   Then add `baseline: .evergreen-baseline.json` under the Action's `with:` and `"baseline": [".evergreen-baseline.json"]` to `.evergreen.json`. Every entry should carry an owner and a reason.

Run the same check locally:

```bash
npx evergreen-deprecation scan . --fail-on high
```

`contents: read` is enough for the workflow. Pin the Action to a release tag, as above, and see [GITHUB_ACTION.md](../../../docs/GITHUB_ACTION.md) for the other inputs, SARIF upload, and SHA pins.
