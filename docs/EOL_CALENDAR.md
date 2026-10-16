# Lifecycle calendar

Evergreen can list the lifecycle dates in its registry that are coming up, or that just passed, as a Markdown table and an `.ics` file you can subscribe to. It reads `registry/*.json` and never uses the network.

```bash
npm run build
node dist/tools/eol-calendar.js --out-dir calendar
```

This writes `calendar/eol-calendar.md` and `calendar/eol-calendar.ics`. Options:

| Option | Default | Meaning |
| --- | --- | --- |
| `--today YYYY-MM-DD` | today (UTC) | The reference day. Use it for reproducible output. |
| `--months N` | `6` | How far ahead to look. |
| `--recent-days N` | `30` | How far back to list dates that just passed. |
| `--out-dir DIR` | current directory | Where to write the two files. |

Each entry is a rule's `deadline`, with its title, severity, rule id, and first source. The CI job on the default branch generates the calendar and uploads it as the `eol-calendar` artifact, so the committed docs do not change every day.

## Limits

The calendar can only show dates the registry holds. Today most rules record events that have already happened (an end-of-life that has passed), so the upcoming list is short or empty. A rule for a future end-of-life, such as a release line that is still supported but has a published end date, appears here as soon as the registry has it.
