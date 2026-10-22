# Self-scan reports

One file per month, `self-scan-YYYY-MM.md`, written by a maintainer. Each report is a scan of this repository with the Evergreen build on `main`; nothing in it comes from users. How findings are triaged is described in [docs/ADOPTION.md](../docs/ADOPTION.md#triaging-self-scan-findings).

## Template

```markdown
# Self-scan report: YYYY-MM

Commit: `<sha>` · Evergreen `<version>` · Lifecycle data `<data version>`, reviewed through `<date>`
Reproduce: `npm run build && node dist/src/cli.js scan . --json`

## Counts

| | |
| --- | --- |
| Findings | n |
| Covered by the baseline | n |
| Unclassified Action references | n |
| Issues labelled `dogfood` opened | n |
| Issues labelled `dogfood` closed | n |

## Outcomes

One line per triaged finding: the finding ID, the outcome (false positive, missing rule, real debt), and the issue.
```
