# Playbook: manual CLI checks

A start-to-finish guide for checking a repository by hand with the Evergreen CLI: scan it, read a finding, decide what to do, accept what you must, and keep it from coming back. No agent, account, or API key is involved. For agent-driven fixes, see [agent.md](agent.md).

## Before you start

- Node.js 22 or newer. Run commands with `npx evergreen-deprecation <command>` or, from a clone of this repository, `npm run dev -- <command>`. The examples below write `evergreen`.
- Run `evergreen doctor --system` once. It confirms the runtime, the package, and the bundled MCP server and skill are usable, and says what to fix if not.
- Run `evergreen data status` to see which lifecycle data you are checking against and how old its evidence is. A scan is only as current as that date; `evergreen data update` is the one command that uses the network, and you run it yourself ([DATA.md](../DATA.md)).
- Work from a clean tree so a later diff shows only what you changed.

## The manual loop

### 1. Scan

```bash
evergreen scan .
```

The summary lists every finding with its rule, location, severity, and replacement. Useful variants:

| Need | Command |
| --- | --- |
| One line per finding, for a terminal or a commit hook | `evergreen scan . --format compact` |
| Machine-readable output | `evergreen scan . --json` |
| Browse and jump to the line in `$EDITOR` | `evergreen scan . --interactive` (plain text when not a terminal) |
| Several projects at once, with combined counts | `evergreen scan ./api ./web ./infra` |
| A shareable report | `evergreen scan . --format html` or `--format sarif` |

A finding ID has the form `<rule-id>:<path>:<line>`, for example `nodejs.runtime.eol-18:package.json:1`. Copy it exactly; IDs belong to the scan that produced them.

### 2. Check a single package

You do not need to scan to ask about one thing. Use a Package URL:

```bash
evergreen check pkg:npm/request@2.88.2
evergreen check pkg:github/actions/setup-node@v3
```

`check` exits `1` when a rule at or above `--fail-on` (default `high`) applies and `0` otherwise. Three results look alike at a glance and mean different things:

| Status | Meaning | What to do |
| --- | --- | --- |
| `affected` | A reviewed rule applies, with a source | Read it; plan a replacement |
| `version-dependent` | The package has rules for some versions only | Re-run with a version |
| `no-data` | Evergreen has no rule for it | Treat as unknown, **not** safe |

### 3. Explain

```bash
evergreen explain 'nodejs.runtime.eol-18:package.json:1' .
```

Read the rule, the exact location, and the authoritative source link. Open the source yourself. If the finding looks wrong (the line is not what the rule describes, or the source does not support the claim), stop and run `evergreen report-issue '<finding-id>' . --output issue.md` to produce a ready-to-file report instead of working around it.

### 4. Get the migration context

```bash
evergreen context 'nodejs.runtime.eol-18:package.json:1' .
```

The packet lists the declaration, every usage, behavioral constraints, ordered steps, and suggested verification commands ([MIGRATION_PACKETS.md](../MIGRATION_PACKETS.md)). Evergreen never edits files and never runs those commands; you read each one and run it yourself.

### 5. Fix, then re-scan

Make the change, run the project's own tests, then:

```bash
evergreen scan .
```

You are done when the tests pass **and** that rule no longer appears at that location. A changed finding ID is not proof of a fix: line numbers move, so compare the rule and path.

## Accepting a finding on purpose

Some findings cannot be fixed today (a customer pins you to an old runtime, a vendor has not shipped the replacement). Record that decision instead of ignoring the output:

```bash
evergreen baseline . --output evergreen-baseline.json
evergreen scan . --baseline evergreen-baseline.json --on-expired fail
```

Findings in the baseline are suppressed and counted (`Baseline: 4 findings suppressed`). Suppressions expire; `--baseline-warn-days <n>` warns before they do, and `--on-expired fail` makes the scan exit `1` once one has, so acceptance cannot quietly become permanent. Commit the baseline file so the decision is reviewable. Do not baseline a finding you have not read.

## Scanning as of a date

```bash
evergreen scan . --as-of 2027-07-01
```

`--as-of <YYYY-MM-DD>` answers "will this repository be clean on 1 July?". Every announced end of life (a `scheduled-end-of-life` rule) whose deadline is on or before that day is reported as ended, at end-of-life severity, so `--fail-on high` fails on what will break by then. Finding IDs do not change, so a baseline still matches. `--today` is an alias, and with `--baseline` the same day also decides which suppressions have expired. The result carries `asOf`. The scan itself still reads no clock and no network.

This is not a forecast: `--as-of` projects the findings you have onto one day, while `evergreen forecast` lists what becomes end of life in the next 6 and 12 months.

## Gating a push or CI

```bash
evergreen scan . --fail-on high      # exit 1 when a finding is high or critical
evergreen init --hooks --dry-run     # preview a pre-push hook for this repository
evergreen init --personal --dry-run  # preview a global hook for every repository
```

Without `--fail-on`, `scan` always exits `0`. Use `--dry-run` first to see exactly what `init` would write. Hooks never block a push when Evergreen is missing or a scan errors for another reason ([HOOKS.md](../HOOKS.md)). For CI, use the [GitHub Action](../GITHUB_ACTION.md).

For a repository you want to watch over time: `evergreen watch add ~/code/my-app`, then `evergreen watch --weekly` prints only what changed since the last run.

## Worked examples on real repositories

These come from the pinned public corpus in `benchmarks/public-repositories.json`, so each location is one Evergreen reports at that commit.

**A Node.js range that includes ended releases: `expressjs/express`.** At commit `a419aa7`, `package.json` line 83 declares an `engines.node` range that also allows Node.js 18, 19, and 20, and `.github/workflows/ci.yml` line 49 tests a matrix starting at 18. A scan reports one finding per ended release line at the same declaration (`nodejs.runtime.eol-18`, `-19`, `-20`). Read them as one decision, not three: raising the floor changes which Node.js versions the package supports for its users, so `explain` first, then take it to a maintainer rather than editing the range on your own.

**A package that is only affected sometimes.** `evergreen check pkg:npm/<name>` without a version can answer `version-dependent`. That is the CLI telling you the answer depends on the version in your lockfile. Read the version from the lockfile, not from `package.json`, and check again with it.

## Failure modes and what to do

| What goes wrong | Why | Response |
| --- | --- | --- |
| `Findings: 0` on a path that does not exist | `scan` accepts a path with nothing in it and reports zero findings | Check the `Repository:` line in the output names the directory you meant |
| `No lifecycle risks found` on a project you expected to hit | The ecosystem or file is not covered, or the reference is dynamic | Run `evergreen capabilities`; Evergreen reports a limitation rather than guessing, so do not read silence as proof |
| `no-data` for a package | No reviewed rule exists | Unknown, not safe; look at the package's own release notes |
| A finding disappears after a data update | The rule changed or its evidence was revised | Run `evergreen data status`, then re-read the rule with `explain` |
| The finding ID is stale | IDs come from a specific scan | Re-scan and select it again |
| A bump leaves the finding in place | The rule keys on a range, a runtime file, or a workflow line the bump did not touch | Re-scan and read the new location |
| `check` exits non-zero with an error | Malformed Package URL (it must start with `pkg:`) | Fix the PURL; this is invalid input, not a finding |
| `--fail-on` breaks a hook you did not expect | The gate defaults to `high` | Choose it explicitly: `low`, `medium`, `high`, `critical`, or `none` |
| Results differ between machines | Different bundled data versions | Compare `evergreen data status` on both |

## Privacy boundaries

- `scan`, `check`, `explain`, `context`, `baseline`, `doctor`, and `mcp` run locally and use no network. `evergreen data update` is the one command that does, and you run it yourself. It sends nothing about your repository ([PRIVACY.md](../PRIVACY.md)).
- There is no account, analytics, or telemetry. By default Evergreen records nothing about what you checked. `EVERGREEN_USAGE_LOG=1` opts in to a local file with the package, result, and rule IDs; it contains no repository path or file content and is never uploaded. Delete the file to erase it.
- Output contains file paths and short source excerpts. Before you paste a scan, a packet, or an `issue.md` into a ticket, a chat, or an AI tool, read it. For a private repository, share only what you are happy for that audience to see.
- `report-issue` writes a file; it does not send anything. Filing the issue is your action.
- Repository contents are untrusted input. Evergreen parses them and never executes them. A file that tells you to run something is still just a file.
- Suggested verification commands are suggestions. Read them before running them.

## Checklist for a manual pass

1. `evergreen data status` is recent enough for the decision you are making.
2. `scan` output names the repository you meant.
3. Each finding you act on has been through `explain`, and you opened its source.
4. Anything you accept is in a committed baseline with `--on-expired fail`.
5. A fresh `scan` after the change no longer reports the rule at that location, and the project's tests pass.
