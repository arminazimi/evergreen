# 0010 — Record announced end-of-life dates that have not happened yet

Status: accepted

## Problem

Every rule in the registry records something that already happened: a release line that ended, a package that was deprecated. A scan reports a rule whenever its affected versions match, so a rule for a line that is still supported cannot be written today without telling every user of that line that it has ended. As a result nothing warns before a date, and the [lifecycle calendar](../EOL_CALENDAR.md) has an empty "upcoming" list. The vendors announce these dates well ahead (Node.js 22 ends 2027-04-30, PostgreSQL 14 on 2026-11-12), and it is the warning, not the report afterwards, that people search for.

## Decision

1. **A new lifecycle event, `scheduled-end-of-life`.** It is added to the `event` list of the registry v2 format (an additive change, so the schema version stays `evergreen.registry.v2`). The rule's `deadline` is the announced date. The affected versions (`purl` and `vers`) are the ones that will end, exactly as the later `end-of-life` rule will write them.
2. **A scheduled rule is reported by the same detectors, with a low severity.** It is a finding with the rule's source and `deadline`, at severity `low`, so `fail-on-severity: high` and similar gates do not fail on a date that is months away. Its text says the line *will* end; reporters may add "ends in N days" computed from the scan time, but the finding's identity (rule id, path, line) never depends on the clock.
3. **The registry only holds dates that are close.** An importer drafts a scheduled rule only when the announced end is within twelve months of the draft date, which keeps the number of rules, and the noise in a scan, small. A reviewer decides whether to accept each one, as for every importer draft.
4. **Promotion is a reviewed change, not a scan-time decision.** When the date passes, the rule's event becomes `end-of-life` and its severity returns to the level of the other end-of-life rules. A scan never compares a deadline with the clock to decide what a rule means, so scans stay deterministic for a given data bundle. The source-freshness check lists scheduled rules whose deadline is in the past as "due for promotion", and the importers draft the promoted rule in the same run.
5. **The calendar reads them.** `tools/eol-calendar.ts` already lists deadlines in a window; scheduled rules fill its upcoming list. SARIF reports them at level `note`.

## Alternatives rejected

- **An `end-of-life` rule with a future `deadline`.** Detectors do not read the clock, so every user of the line would be told it has ended today.
- **Comparing `deadline` with the current date inside detectors.** The same repository would produce different findings on different days, which breaks reproducible CI, baselines, and the corpus.
- **A separate "upcoming" registry file.** It splits one fact into two files and two review paths, and the promotion step would have to move a rule between them.

## Consequences

- The registry schema, `lifecycleEvents`, the SARIF mapping, the MCP outputs, and the docs gain one value; the JSON Schemas change additively.
- Rules for a scheduled line need a `deadline`; a scheduled rule without one is invalid.
- Reports for a line that is still supported now contain a low-severity note. A declaration whose floor is a supported line (for example `>=22`) keeps the existing floor-based matching in the Node.js and Python detectors, so a wide range is not reported for a scheduled line it merely allows.
- The corpus needs an entry for any new scheduled finding, like any new finding.
- Out of scope: notifications, per-user opt-out of scheduled notes (use a baseline), and dates that vendors have not announced.
