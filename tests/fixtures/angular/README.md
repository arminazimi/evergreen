# Angular lifecycle fixtures

These fixtures back the `@angular/core` lifecycle rules in `registry/npm.json` (issue #247). Each directory is a project root read by `NpmDetector`. Lifecycle status comes from the [Angular release and support schedule](https://angular.dev/reference/releases) as of 2026-10-21: v22 is Active, v21 and v20 are LTS, and v2 to v19 are no longer supported. The migration steps follow the [Angular Update Guide](https://angular.dev/update-guide).

| Fixture directory | Expected case |
| --- | --- |
| `positive/v20` | `@angular/core` resolved to `20.3.0`. Matches the scheduled end-of-life rule for v20 (deadline `2026-11-28`, severity `low`). |
| `positive/v19` | `@angular/core` resolved to `19.2.0`. Matches the end-of-support rule for v19 (severity `high`). |
| `positive/v18` | `@angular/core` resolved to `18.2.0`. Matches the end-of-support rule for v18 and older (severity `high`). |
| `negative/v21` | `@angular/core` resolved to `21.0.0`, an LTS major with no rule yet: its LTS end date is published only as `2027-06`, which is not a day-precision deadline. No finding. |
| `negative/v22` | `@angular/core` resolved to `22.0.0`, the Active major. No finding. |
| `zero/no-angular` | No Angular dependency. No finding. |

Versions are tested for range membership in `tests/angular.test.ts`. The `-0` bounds keep prereleases of a major with its own rule (for example `19.0.0-next.3`) and exclude the next major's prereleases (for example `20.0.0-next.0` against the v19 rule).
