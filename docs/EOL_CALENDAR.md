# Lifecycle calendar

Evergreen can list the lifecycle dates in its registry that are coming up, or that just passed, as a Markdown table, an `.ics` file, and RSS and Atom feeds you can subscribe to. It reads `registry/*.json` or a data release bundle, and never uses the network.

```bash
npm run build
node dist/tools/eol-calendar.js --out-dir calendar
```

This writes `calendar/eol-calendar.md`, `calendar/eol-calendar.ics`, `calendar/eol-calendar.rss`, and `calendar/eol-calendar.atom`. Options:

| Option | Default | Meaning |
| --- | --- | --- |
| `--today YYYY-MM-DD` | today (UTC) | The reference day. Use it for reproducible output. |
| `--months N` | `6` | How far ahead to look. |
| `--recent-days N` | `30` | How far back to list dates that just passed. |
| `--out-dir DIR` | current directory | Where to write the four files. |
| `--bundle FILE` | none | Load rules from a signed data release bundle instead of `registry/`. |
| `--registry DIR` | `registry` | Directory holding `registry/*.json` rule files. |

Each entry is a rule's `deadline`, with its title, severity, rule id, and first source. The CI job on the default branch generates the calendar and uploads it as the `eol-calendar` artifact, so the committed docs do not change every day.

## Subscribing to feeds

You and automated agents can subscribe to upcoming and recent lifecycle events through standard feed formats:

- **RSS 2.0:** `calendar/eol-calendar.rss` (hosted on the documentation site: `https://arminazimi.github.io/evergreen/eol-calendar.rss`)
- **Atom 1.0:** `calendar/eol-calendar.atom` (hosted on the documentation site: `https://arminazimi.github.io/evergreen/eol-calendar.atom`)
- **iCalendar:** `calendar/eol-calendar.ics`

Feeds update whenever the calendar is generated from new registry changes or data releases.

## Limits

The calendar can only show dates the registry holds. Today most rules record events that have already happened (an end-of-life that has passed), so the upcoming list is short or empty. A rule for a future end-of-life, such as a release line that is still supported but has a published end date, appears here as soon as the registry has it. Such a rule uses the `scheduled-end-of-life` event ([decision 0010](decisions/0010-scheduled-end-of-life.md)); the .NET 8 and 9 rules are the first.
