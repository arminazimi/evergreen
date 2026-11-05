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

## Secret scanning push protection

Secret scanning and secret scanning push protection are enabled for `arminazimi/evergreen`, verified through
the repository API on 2026-11-05 (`security_and_analysis.secret_scanning_push_protection.status: enabled`).
The maintainer checks this setting in **Settings → Security → Secret scanning** at each release.

If push protection blocks a recording, screenshot, transcript, or fixture:

1. Stop the push and read the reported file and commit locations. Do not paste the secret into an issue,
   pull request, or bypass explanation.
2. If the value is a real credential, revoke or rotate it with its provider immediately. Remove it from the
   recording and every local commit being pushed; deleting it only in a later commit leaves it in history.
3. Replace the recording with a redacted version or record it again with dummy values. Keep credentials in
   environment variables outside the recording, and inspect the replacement and the outgoing diff.
4. Retry the push after removing the value from all affected commits. Do not bypass protection to publish
   a recording containing a real credential.
5. For a confirmed false positive or an intentionally nonfunctional test value that cannot be replaced,
   ask the maintainer to review the exact detection. Only the maintainer may authorize a bypass, with a
   written reason and a link to the tracking issue. Never use an "I'll fix it later" bypass for a real secret.

Report a credential that already reached GitHub privately through [`SECURITY.md`](../SECURITY.md), and rotate
it even if the file or commit has since been removed.

## Deadlines

Every alert has a deadline, counted in calendar days from the day it is created. Reading the alert, opening a follow-up issue, or asking for a fix does not stop the clock.

| Severity | Deadline |
|---|---|
| Critical | 7 days |
| High | 30 days |
| Medium | 90 days |
| Low | 180 days |

- **The clock starts** when the alert is created (the alert's `created_at`), not when someone first notices it.
- **A severity change restarts the clock.** If the severity is raised or lowered after triage, the deadline is recalculated from the date of the change with the new severity. A dismissed alert that is reopened is treated as new, with its original severity.
- **The deadline is met** when the alert is closed: a merged change removes the vulnerable version from every shipped manifest and lockfile, or the alert is dismissed under the rule below. An open follow-up issue is a record, not a resolution.
- **An alert past its deadline is overdue, not dismissed.** It stays open and is listed in the tracking issue described under [When the maintainer is away](#when-the-maintainer-is-away) until a fix or a valid dismissal closes it.
- A vulnerability reported privately through `SECURITY.md` keeps the acknowledgement and assessment times stated there. Once it produces a dependency alert, this table applies from the alert's creation date.

## Dismissal

Dismissing an alert is a decision that has to survive being read a year later. An alert is dismissed only by the named person, only for a stated reason, and only when that reason is written down.

**The named person** is the maintainer, [@arminazimi](https://github.com/arminazimi), who holds the security role in [MAINTAINERS.md](../MAINTAINERS.md) and is the code owner in [`.github/CODEOWNERS`](../.github/CODEOWNERS). A dismissal that does not name a person is not valid, and it is reversed at the next release review.

A dismissal is allowed for these reasons only:

| Reason | When it applies |
|---|---|
| `not_used` | The vulnerable package is only in a fixture or example manifest that is never installed, shipped, or run as the product's dependency. |
| `inaccurate` | The alert is wrong for this repository: no shipped lockfile resolves the vulnerable version, or the vulnerable code path is not reachable. |
| `tolerable_risk` | The maintainer accepts the risk in writing, with the condition under which the decision would change and a date to re-check it. |

`no_bandwidth`, or any reason that only means "not yet", is never used. Capacity is not a dismissal reason; an alert that cannot be fixed by its deadline stays open and overdue.

To dismiss an alert:

1. Write the dismissal comment on the alert first. It states the named person, the reason, the evidence (the manifest path and why the code is not shipped or reachable, or the accepted risk and review date), and a link to the pull request, issue, or release note that records the same reasoning.
2. Add a row to the dismissal log below with the same date, alert, package, reason, and person.
3. Dismiss the alert with that reason in the GitHub UI.

| Date | Alert | Package | Reason | Person |
|---|---|---|---|---|
| _None yet._ | | | | |

**Every dismissal is reviewed at release.** When the baseline table above is updated for a release, each row in the dismissal log is re-read against the current manifests. A dismissal whose reason no longer holds is reversed: the alert is reopened and treated as new, with its deadline counted from the reopening date. A fixture that has become a shipped dependency is the usual cause.

## When the maintainer is away

Evergreen has a single maintainer, [@arminazimi](https://github.com/arminazimi) ([MAINTAINERS.md](../MAINTAINERS.md)), and this policy does not name a deputy. Responsibility stays with the maintainer when the maintainer is unavailable; it does not pass to a contributor, an agent, or whoever opened the pull request.

While the maintainer is away:

- **Security reports** still go through the private channel in [`SECURITY.md`](../SECURITY.md), which is unchanged. They wait for the maintainer and are not closed in the meantime. The acknowledgement and assessment times in `SECURITY.md` apply once the maintainer is available again.
- **Overdue alerts stay visible.** The maintainer keeps one pinned issue titled `Security triage queue` listing every open alert with its severity, deadline, and status. It is updated when an alert is triaged and at each release, so an alert past its deadline is visible in the repository, not only in the alerts tab.
- **No alert is dismissed** during that period, and absence is not a reason to dismiss one.
- **Dependabot pull requests** keep opening and CI keeps running. A contributor may prepare or review an update pull request, but only the maintainer merges it, because merging a dependency update is what closes an alert.

## Triage

For each new alert:

1. Note the alert number, severity, manifest path, package, and deadline from [Deadlines](#deadlines) in the pull request or issue that handles it.
2. Check whether the affected code is shipped. Product and tooling manifests count as shipped. Fixture and example manifests count as test data.
3. If a fix exists, prefer the Dependabot update PR. It runs the same `npm run check` as any other change.
4. If the vulnerable code is only a fixture, and no fix is needed to ship, dismiss the alert under [Dismissal](#dismissal) with the reason `not_used` or `inaccurate`; never without the written comment and the dismissal log row.
5. If the alert cannot be fixed yet, open a follow-up issue that names the alert and the planned date, and keep the alert listed as overdue in the `Security triage queue` issue.

Update the baseline table in this file when the open count changes at a release, and review the dismissal log at the same time.
