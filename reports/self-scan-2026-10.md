# Self-scan report: 2026-10

Commit: `5cd81f8` · Evergreen `0.7.1` · Lifecycle data `0.7.1` (bundled), reviewed through 2026-10-27
Reproduce: `npm run build && node dist/src/cli.js scan . --json`

This is the first report. The self-scan became a required CI check this month (`self-scan` job in `.github/workflows/ci.yml`), the workflows' Actions were pinned to full SHAs, and `.evergreen-baseline.json` was created empty.

## Counts

| | |
| --- | --- |
| Findings | 0 |
| Covered by the baseline | 0 |
| Unclassified Action references | 0 |
| Issues labelled `dogfood` opened | 0 |
| Issues labelled `dogfood` closed | 0 |

## Outcomes

No findings were produced, so nothing needed triage: no false positives, no missing rules, and no real debt. The baseline is empty, so the next finding fails CI instead of being hidden.

## Other repositories

Slipway added the Action in report-only mode this month ([arminazimi/slipway#598](https://github.com/arminazimi/slipway/pull/598)) and is the only repository outside this one that runs Evergreen so far. The rest of the dogfooding set ([#1219](https://github.com/arminazimi/evergreen/issues/1219)) is listed with the issue that adds the Action, so gaps stay visible. The Slipway counts come from the build named above, run against its `main` branch.

| Repository | Integration | Last scan | Findings | Covered by the baseline | Issues labelled `dogfood` |
| --- | --- | --- | --- | --- | --- |
| [`arminazimi/slipway`](https://github.com/arminazimi/slipway) | GitHub Action, report-only | 2026-10-28, `00cf13e` | 5 | 0 | 0 |
| [`arminazimi/seaworthy`](https://github.com/arminazimi/seaworthy) | not running ([#1300](https://github.com/arminazimi/evergreen/issues/1300)) | — | — | — | — |
| [`arminazimi/oakum`](https://github.com/arminazimi/oakum) | not running ([#1301](https://github.com/arminazimi/evergreen/issues/1301)) | — | — | — | — |
| [`arminazimi/CineGraph`](https://github.com/arminazimi/CineGraph) | not running ([#1302](https://github.com/arminazimi/evergreen/issues/1302)) | — | — | — | — |
| [`arminazimi/homebrew-tap`](https://github.com/arminazimi/homebrew-tap) | not running ([#1303](https://github.com/arminazimi/evergreen/issues/1303)) | — | — | — | — |

Slipway's five findings were all real debt, so none produced a `dogfood` issue. They are left for Slipway to fix; its report-only workflow does not gate on them.

- `go.runtime.end-of-support-1.22:adapters/hugo/go.mod:3` — real debt: the Hugo adapter declares Go 1.22, whose support ended on 2025-02-11.
- `nodejs.runtime.eol-22:.github/workflows/ci.yml:37` — real debt: Node.js 22 reaches end-of-life on 2027-04-30.
- `nodejs.runtime.eol-22:.github/workflows/ci.yml:109` — real debt: Node.js 22 reaches end-of-life on 2027-04-30.
- `nodejs.runtime.eol-22:.github/workflows/deploy-site.yml:23` — real debt: Node.js 22 reaches end-of-life on 2027-04-30.
- `nodejs.runtime.eol-22:.github/workflows/release.yml:30` — real debt: Node.js 22 reaches end-of-life on 2027-04-30.
