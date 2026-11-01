# Security triage

How dependency alerts for this repository are read and handled. The policy for reporting vulnerabilities lives in [`SECURITY.md`](../SECURITY.md). Automated update PRs are configured in [`.github/dependabot.yml`](../.github/dependabot.yml).

## Baseline

Recorded on 2026-11-01 from `main`, for `arminazimi/evergreen` (public repository).

| Item | Value |
|---|---|
| Dependabot alerts | On. The `vulnerability-alerts` endpoint answers `204 No Content`. |
| Open alerts | 0 |
| Dismissed alerts | 0 |
| Fixed alerts | 0 |
| Auto-dismissed alerts | 0 |
| Alerts from fixtures | 0. No open alert points at a fixture manifest. |

The repository has 137 dependency manifests and lockfiles (`package.json`, lockfiles, `go.mod`, `pom.xml`, `Gemfile.lock`, `requirements*.txt`, and similar), outside `node_modules` and `dist`:

| Location | Count |
|---|---|
| `tests/` | 115 |
| `examples/` | 13 |
| `plugins/*/review-fixtures/` | 1 |
| Product and tooling | 8 |
| **Fixture and example total** | **129** |

Fixture manifests are test inputs. They are not installed, shipped, or run as the product's dependencies. An alert that comes only from a fixture is still recorded here, and is triaged as below before it is dismissed.

## Triage

For each new alert:

1. Note the alert number, severity, manifest path, and package in the pull request or issue that handles it.
2. Check whether the affected code is shipped. Product and tooling manifests count as shipped. Fixture and example manifests count as test data.
3. If a fix exists, prefer the Dependabot update PR. It runs the same `npm run check` as any other change.
4. If the vulnerable code is only a fixture, and no fix is needed to ship, dismiss the alert with the reason `inaccurate` or `not_used` and link the triage note.
5. If the alert cannot be fixed yet, open a follow-up issue that names the alert and the planned date.

Update the baseline table in this file when the open count changes at a release.
