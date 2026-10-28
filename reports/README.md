# Self-scan reports

One file per month, `self-scan-YYYY-MM.md`, written by a maintainer. Each report scans this repository with the Evergreen build on `main` and summarizes the maintainer's other repositories that also run Evergreen; nothing in it comes from users. How findings are triaged is described in [docs/ADOPTION.md](../docs/ADOPTION.md#triaging-self-scan-findings).

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

## Other repositories

Repositories outside this one that run Evergreen. A repository that does not run it yet keeps its row with `not running` and the issue that adds it, so gaps stay visible. The counts come from the build named above, run against a checkout of each repository's default branch: `node dist/src/cli.js scan <checkout> --json`.

| Repository | Integration | Last scan | Findings | Covered by the baseline | Issues labelled `dogfood` |
| --- | --- | --- | --- | --- | --- |
| `owner/name` | GitHub Action | `YYYY-MM-DD`, `<sha>` | n | n | n |

One line per finding triaged this month, in the form used under Outcomes: the finding ID, the outcome, and the issue.
```
