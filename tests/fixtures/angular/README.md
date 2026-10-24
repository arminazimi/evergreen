# Angular lifecycle fixtures

These fixtures back the `@angular/core` lifecycle rules in `registry/npm.json` (issue #247). Each directory is a project root read by `NpmDetector`. Lifecycle status comes from the [Angular release and support schedule](https://angular.dev/reference/releases) as of 2026-10-21: v22 is Active, v21 and v20 are LTS (v21 and v22 end dates are month-precision), and v2 to v19 are no longer supported. The migration steps follow the [Angular Update Guide](https://angular.dev/update-guide).

| Fixture directory | Expected case |
| --- | --- |
| `positive/v22` | `@angular/core` resolved to `22.0.0`. Matches the scheduled end-of-life rule for v22. The schedule publishes only `2028-06`, so the deadline is the last day of that month, `2028-06-30` (severity `low`). |
| `positive/v21` | `@angular/core` resolved to `21.0.0`. Matches the scheduled end-of-life rule for v21. The schedule publishes only `2027-06`, so the deadline is the last day of that month, `2027-06-30` (severity `low`). |
| `positive/v20` | `@angular/core` resolved to `20.3.0`. Matches the scheduled end-of-life rule for v20 (deadline `2026-11-28`, severity `low`). |
| `positive/v19` | `@angular/core` resolved to `19.2.0`. Matches the end-of-support rule for v19 (severity `high`). |
| `positive/v18` | `@angular/core` resolved to `18.2.0`. Matches the end-of-support rule for v18 and older (severity `high`). |
| `zero/no-angular` | No Angular dependency. No finding. |

Versions are tested for range membership in `tests/angular.test.ts`. The `-0` bounds keep prereleases of a major with its own rule (for example `19.0.0-next.3`) and exclude the next major's prereleases (for example `20.0.0-next.0` against the v19 rule).
