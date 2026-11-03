# Data audit and corrections

Evergreen's findings come from reviewed lifecycle rules (`registry/`). A rule is data, not code, and its authority is the source it cites. When that data is wrong or missing, it should be easy to report, quick to answer, and visible once fixed. This page is that process: what to report, what evidence a report needs, who changes the rule, the gate the change runs through, the response target, and the public record.

- Reporting a lifecycle **software bug** (a crash, bad output, a detector that errors): use the Bug report form, not this one.
- Reporting a **vulnerability**: use the private channel in [SECURITY.md](../SECURITY.md), never a public issue.
- Everything below is about the **data**: the date, versions, event, severity, replacement, or source a rule carries, and rules that should or should not exist.

## What counts as a data problem

A correction is any of these about a shipped rule or a gap in coverage:

- A wrong **effective date or deadline**, **affected version range**, **lifecycle event**, **severity**, **replacement or migration**, or a **source** that does not state the claim.
- A rule that **should not exist** — the product is not actually deprecated, end-of-life, or removed.
- A **false positive** — the rule matches code it should not (its `usage` matcher fires where it should not).
- A **false negative** — a real, source-backed lifecycle risk Evergreen does not report.

The last two are read against the same [evidence policy](../CONTRIBUTING.md#evidence-policy) as any rule: the claim needs an authoritative, versioned source.

## Filing a correction

Open the [Data correction form](https://github.com/arminazimi/evergreen/issues/new?template=correction.yml). It asks for six things, and you can fill them in under a minute:

1. **What is wrong** — one pick from the list above.
2. **Rule id or affected item** — the id on the finding's `Rule:` line (for example `npm.package.request.deprecated`), or the package and version for a missing rule.
3. **Authoritative source URL** — the maintainer or platform page that states the correct fact, with the version or date visible on it.
4. **Date you checked the source** — today's date; a merged correction records it as the rule's `sources[].accessedAt`.
5. **What Evergreen claims now** — paste the finding output or the rule's current text.
6. **What the source says it should be** — one or two sentences, quoting the source.

You do not need to write code or open a pull request to file one. A scan command (`evergreen scan`), the finding, and the source page are enough.

## The evidence a correction cites

So a report lines up with what the registry actually stores, these are the real fields a rule carries and the rules the validator (`src/registry.ts`) enforces on them. A correction that names the field is the fastest to act on.

| Field | What it holds | Constraint the validator applies |
|---|---|---|
| `id` | The stable rule id, e.g. `npm.package.request.deprecated`. | Lowercase letters, digits, dots and hyphens (`/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/`), unique across all files (`src/registry.ts:65`, `:111`, `:242`). |
| `purl` | The Package URL of the thing the rule is about. | Canonical and **version-less**, no qualifiers or subpath (`src/registry.ts:147`–`159`). |
| `vers` | The affected version range. | The `vers:<scheme>/<ranges>` form; the scheme must be supported and fit the PURL type, e.g. a `npm` scheme for `pkg:npm` (`src/registry.ts:161`–`175`; example `registry/npm.json`, first rule `"vers": "vers:npm/*"`). |
| `event` | The lifecycle event. | One of `deprecated`, `end-of-support`, `end-of-life`, `removed`, `scheduled-end-of-life` (`src/registry.ts:13`, `:128`). |
| `severity` | How urgent the finding is. | One of `info`, `low`, `medium`, `high`, `critical` (`src/domain.ts:1`, enforced at `src/registry.ts:127`). |
| `deadline` | The date the change takes effect. | Optional, but a real `YYYY-MM-DD` calendar date; a `scheduled-end-of-life` rule must carry it and be `severity: low` (`src/registry.ts:140`–`145`). |
| `sources[]` | The pages the claim rests on. | At least one; each has a non-empty `title`, an `https` `url`, and an optional `accessedAt` that must be a `YYYY-MM-DD` date (`src/registry.ts:177`–`189`). |
| `provenance` | Who checked it and when. | `observedAt` and `reviewedAt` are both real dates, `reviewedAt` must not precede `observedAt`, `reviewer` is required, and `importer` is optional (`src/registry.ts:191`–`204`). |
| `freshness` | The review window for the registry file. | Rules reviewed longer ago than `freshness.maxReviewAgeDays` are stale; the default window is 365 days (`src/registry.ts:11`, `:264`–`275`). |

## Who fixes it, and how

A correction **issue** does not edit `registry/*.json` on its own. The registry is reviewed data with a maintainer code owner (see [`.github/CODEOWNERS`](../.github/CODEOWNERS)), so the change lands as a rule change that a maintainer merges. The reporter, a contributor, or the maintainer can open that pull request; whoever opens it does not have to be whoever filed the correction.

A rule fix follows the same path as adding a rule ([Lifecycle rules](RULES.md#from-a-source-to-a-merged-pull-request)):

1. Edit the named fields of that rule in `registry/<ecosystem>.json` — correct the date, range, event, severity, replacement, or source, add a missing rule, or remove one that should not exist.
2. Set the provenance to who checked and when: update `sources[].accessedAt`, and set `provenance.reviewedAt` to the review date with `provenance.reviewer` named. `reviewedAt` must not precede `observedAt`.
3. Keep both fixtures honest: `tests/fixtures/<rule-id>/match/` must still report the rule and `clean/` must still not.
4. Run `evergreen rules lint registry/<file>.json`, then `evergreen rules test <rule-id>`, then `npm run check`.

Do **not** hand-edit the generated pages that read from the registry (`docs/rules/`, `docs/sitemap.xml`, `docs/api/v1/`, `docs/dashboard/data.json`); they are regenerated from `registry/*.json` at build time — see [AGENTS.md](../AGENTS.md#generated-files--do-not-edit-by-hand).

## The gate a correction runs through

Every rule a pull request touches is checked before merge by the **"Rules (changed)"** job ([`.github/workflows/rules.yml`](../.github/workflows/rules.yml)). After `npm run build` it runs:

```bash
node dist/tools/changed-rules.js --base <sha> --summary "$GITHUB_STEP_SUMMARY"
```

That tool (`tools/changed-rules.ts`) lints each changed `registry/*.json` and runs the fixture harness for every rule id the diff added or changed. A rule with no fixtures fails: the harness (`src/rule-test.ts`) needs **both** `tests/fixtures/<rule-id>/match/` and `tests/fixtures/<rule-id>/clean/`, and reports `missing fixture` when either is absent. The same checks run locally and offline with `evergreen rules lint` and `evergreen rules test <rule-id>`.

## Response target

Deadlines are calendar days counted from the day the correction issue is opened, the same way [security triage](SECURITY_TRIAGE.md) counts alert deadlines. Reading the report, triaging it, or asking for more evidence does not stop the clock. "Fixed" means the merged rule change landed; an open follow-up is a record, not a resolution.

| Correction | First response | Resolved or explained |
|---|---|---|
| Wrong date, version range, event, severity, replacement, or source of a live rule | 3 working days | 14 days |
| Rule should not exist, or a clear false positive | 3 working days | 14 days |
| Missing sourced rule (false negative) | 3 working days | 30 days |
| Claim disputed, evidence ambiguous | 3 working days | until the source settles, with the reason on the issue |

- **The clock starts** when the issue is opened. A **first response** is a maintainer's written reply on the issue: a question, a triage decision, or a link to the pull request that fixes it. Labels and bots do not count.
- A correction past its deadline is **open and overdue**, not dismissed. Absence of bandwidth is not a resolution reason; an unfixed correction stays visible until a change or a written rejection closes it.
- If a target is missed, comment on the issue to nudge the maintainer. A missed target is the project's problem, not the reporter's, and does not mean the correction is unwelcome.

Corrections are one input to keeping the data honest; the other is the proactive weekly **freshness and source** check ([`.github/workflows/sources.yml`](../.github/workflows/sources.yml), `tools/check-sources.ts`), which flags rules past their review window and sources whose URL or title has moved or gone dark.

## Public record of corrections

Every accepted correction is recorded in two places, so the ledger and the data agree:

- In the rule itself — the change updates that rule's `sources[].accessedAt` and `provenance.reviewedAt` / `reviewer`, which is the per-rule audit trail a scan can point back to.
- In the log below — a human-readable ledger of what was wrong and what fixed it, added when the correction pull request merges.

| Date | Rule | What was wrong | Source | Outcome | By |
|---|---|---|---|---|---|
| _No corrections recorded yet._ | | | | | |

To add a row when a correction merges: the date of the merge, the rule id, a one-line description of the error, the authoritative source URL, the pull request or release that fixed it, and the reviewer named in the new `provenance.reviewer`. Corrections that are rejected or found duplicate close with a written reason on the issue and do **not** get a row; the log records the data that changed, not every report.

## Related

- [Lifecycle rules](RULES.md) — the rule format, the fields above, and how to write or fix one.
- [Lifecycle data](DATA.md) — how rules are signed, distributed, and trusted.
- [Validation](VALIDATION.md) — the public corpus and measured precision, the other way accuracy is checked.
- [Evidence policy](../CONTRIBUTING.md#evidence-policy) and [SECURITY.md](../SECURITY.md) — what a source must be, and how to report a vulnerability instead.
