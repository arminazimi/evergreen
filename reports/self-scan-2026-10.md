# Self-scan report: 2026-10

Evergreen `0.5.0` · Lifecycle data `0.5.0` (bundled), reviewed through 2026-10-22
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
