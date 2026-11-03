# Evergreen Monthly Progress Report: 2026-11

Generated on 2026-11-03 · Evergreen `0.7.2`
Repository: `arminazimi/evergreen`

## Momentum highlights

| Area | Current total | Momentum |
| --- | --- | --- |
| Lifecycle rules | 731 rules | 35 reviewed across 25 ecosystems |
| Supported ecosystems | 25 ecosystems | 11 supported, 14 experimental |
| Validation corpus | 557 repositories | 3,122 expected findings across 20 ecosystems |
| Contributors | 10 contributors, 6 external | 108 commits in 2026-11; 2 external contributors |
| Adoption | unavailable | unavailable |
| Reference quality | 187 over complexity; 573 non-null | 187 over complexity; 573 non-null (snapshot 2026-11-03) |

## Lifecycle rules

Evergreen tracks evidence-backed lifecycle events across 25 ecosystems. Every rule links to an authoritative, versioned public source.

- **Total rules:** 731
- **Rules with replacements:** 679 (92.9%)
- **Rules with migration guidance:** 729 (99.7%)
- **Rules with AST / code usage matchers:** 262 (35.8%)

### Rules by event

| Event | Rules |
| --- | --- |
| end-of-life | 213 |
| deprecated | 166 |
| removed | 157 |
| end-of-support | 146 |
| scheduled-end-of-life | 49 |

### Rules by severity

| Severity | Rules |
| --- | --- |
| critical | 5 |
| high | 513 |
| medium | 117 |
| low | 96 |

### Rules by ecosystem

| Ecosystem | Rules |
| --- | --- |
| serverless | 138 |
| python | 129 |
| npm | 82 |
| nodejs | 80 |
| kubernetes | 73 |
| container | 34 |
| database | 30 |
| github-actions | 25 |
| terraform | 23 |
| dotnet | 16 |
| ruby | 15 |
| php | 14 |
| go | 12 |
| java | 11 |
| android | 6 |
| dart | 6 |
| ci-images | 5 |
| cpp | 5 |
| elixir | 5 |
| rust | 5 |
| shell | 5 |
| deno | 4 |
| scala | 3 |
| swift | 3 |
| osv | 2 |

## Ecosystem coverage

Evergreen provides lifecycle detectors across languages, package managers, and configuration files.

| Ecosystem | Status | Maturity | Detectors |
| --- | --- | --- | --- |
| android | experimental | experimental | `android` |
| bun | experimental | experimental | `deno` |
| ci-images | experimental | experimental | `ci-images` |
| container | experimental | experimental | `container` |
| cpp | experimental | experimental | `cpp` |
| dart | experimental | experimental | `dart` |
| database | experimental | experimental | `database` |
| deno | experimental | experimental | `deno` |
| dotnet | supported | beta | `dotnet` |
| elixir | experimental | experimental | `elixir` |
| github-actions | supported | stable | `github-actions` |
| go | supported | stable | `go` |
| java | supported | beta | `java` |
| kubernetes | supported | beta | `kubernetes` |
| nodejs | supported | stable | `npm` |
| npm | supported | stable | `npm` |
| php | experimental | experimental | `php` |
| python | supported | stable | `python` |
| ruby | experimental | experimental | `ruby` |
| rust | supported | stable | `rust` |
| scala | experimental | experimental | `scala` |
| serverless | supported | beta | `serverless` |
| shell | experimental | experimental | `shell` |
| swift | supported | beta | `swift` |
| terraform | experimental | experimental | `terraform` |

## Validation corpus

To ensure accuracy and guard against regressions, Evergreen validates all detectors against a pinned benchmark corpus.

- **Total repositories:** 557
- **Targeted repositories:** 168
- **Blind / held-out repositories:** 389
- **Total expected findings:** 3,122

| Ecosystem | Repositories | Expected findings |
| --- | --- | --- |
| python | 107 | 432 |
| node | 78 | 350 |
| rust | 78 | 315 |
| go | 43 | 237 |
| node-actions | 34 | 174 |
| swift | 22 | 54 |
| serverless | 21 | 217 |
| kubernetes | 19 | 170 |
| dotnet | 18 | 263 |
| java | 17 | 94 |
| android | 12 | 30 |
| ci-images | 12 | 132 |
| container | 12 | 174 |
| cpp | 12 | 92 |
| dart | 12 | 32 |
| database | 12 | 105 |
| php | 12 | 20 |
| ruby | 12 | 37 |
| shell | 12 | 159 |
| terraform | 12 | 35 |

## Adoption

Adoption is measured from public sources, plus the Search Console landing pages the maintainer enters by hand. Evergreen has no telemetry.

### North-star trend

**GitHub stars:** unavailable

### Channel breakdown

The change compares the newest snapshot of this month with the newest snapshot of the previous month.

| Channel | Count | Change vs last month |
| --- | --- | --- |
| GitHub Action repositories | unavailable | unavailable |
| Pre-commit hook repositories | unavailable | unavailable |
| GitLab component repositories | unavailable | unavailable |
| npm weekly downloads | unavailable | unavailable |
| skills.sh installs | unavailable | unavailable |
| Docs page views | unavailable | unavailable |

### Top landing pages

No Search Console landing pages were entered for 2026-11.

Methodology and sources: [docs/ADOPTION.md](docs/ADOPTION.md)

## Reference quality

Each row is a target from [docs/QUALITY.md](docs/QUALITY.md). The change compares the newest snapshot of this month with the newest snapshot of the previous month; a dash means one side is unavailable, which is never treated as zero. Lower debt and higher coverage or Scorecard are improvements.

*Snapshot: 2026-11-03*

| Criterion | Target | Current | Change vs last month |
| --- | --- | --- | --- |
| File size | median ≤300; none over 800 without an entry | 1 file over 800 | — |
| Complexity | ≤15 per function | 187 functions over 15 | — |
| Type safety | 0 any; 0 @ts-ignore; as unknown as and non-null may not grow | 0 any; 4 as unknown as in 3 files; 573 non-null | — |
| Boundaries | zero violations without an entry | 0 violations | — |
| Coverage | lines ≥93; branches ≥87; functions ≥93 | unavailable | — |
| Mutation score | break at 60; high at 80 | not measured | — |
| Docs | generated checks gate; links and accessibility clean | partial (links report-only) | — |
| Security | no high/critical; Scorecard ≥6 | 5 allowlisted advisories; Scorecard 3.1 | — |
| Remaining debt | allowlist ceilings equal measured values; expire by 2027-01-26 | 187 over complexity; 573 non-null | — |

Methodology and targets: [docs/QUALITY.md](docs/QUALITY.md) · Snapshot: [`metrics/quality/2026-11-03.json`](metrics/quality/2026-11-03.json)

## Review responsiveness

Evergreen's published target is a first review within **2 working days** of a first-time contributor opening a pull request; the clock starts when the pull request is opened for review, or when a draft is marked ready for review. See [CONTRIBUTING.md](CONTRIBUTING.md#review-expectations).

| Metric | This report | Target |
| --- | --- | --- |
| First review of a first-time contributor's pull request | not measured | 2 working days |

*This report reads local files and git history, which do not record when a pull request was first reviewed. The target is published here every month so it stays visible; the report does not print a number it cannot reproduce.*

## Contributors

Evergreen is built with contributions from 10 authors and co-authors across 1,189 commits:

- a.azimi
- Aaqibhafeez Khan
- Armin
- Armin Azimi
- Codebuff
- CommandCodeBot
- Cursor
- dependabot[bot]
- github-actions[bot]
- Hsn

### External contributors

6 external contributors in total, 2 in 2026-11. External means an author or `Co-authored-by` name that is not a maintainer in [MAINTAINERS.md](MAINTAINERS.md) and not a bot. Source: `git log` authors and `Co-authored-by` trailers, with `.mailmap` applied.

- Aaqibhafeez Khan
- Armin (active in 2026-11)
- Codebuff
- CommandCodeBot
- Cursor (active in 2026-11)
- Hsn
