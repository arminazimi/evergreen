# Start contributing

Evergreen's work is split into small issues, each sized for one pull request. You do not need to know the codebase first: every issue in the `lane: free-agent` lane carries a brief with the files to touch, the steps, and the command that proves it is done.

## Pick an issue

- [Open `good first issue` issues](https://github.com/arminazimi/evergreen/issues?q=is%3Aopen+label%3A%22good+first+issue%22) — isolated changes with fixtures. Start here.
- [All open issues](https://github.com/arminazimi/evergreen/issues) — filter by label, area, or size.
- [Project board](https://github.com/users/arminazimi/projects/3) — the current phase and what is in progress.
- [Roadmap](ROADMAP.md) — phases, epics, and what each one delivers.

Choose an issue whose **Depends on** issues are closed, then comment on it to claim it. Epics (`type: epic`) only track tasks; the work happens in their task issues.

## Lanes

A `lane:` label says who an issue suits. It is a promise about the brief, not a restriction.

| Lane | Who it suits | What to expect |
|---|---|---|
| `lane: free-agent` | New contributors and any coding agent | A complete brief: files, steps, commands, and a done-check |
| `lane: strong-agent` | Experienced contributors or strong coding agents | Architecture, contracts, parsers, and new detectors |
| `lane: maintainer` | Maintainer only | Accounts, releases, submissions, and outreach |

Sizes are `size: XS` (under an hour), `size: S` (a few hours), and `size: M` (about a day).

## Rules of the road

- One issue per pull request. If you find more work, open a follow-up issue.
- Add or update a test when behavior changes, and keep JSON output deterministic.
- Lifecycle claims need an authoritative, versioned source. Read the [evidence policy](../CONTRIBUTING.md#evidence-policy).
- Scans never use the network and never run repository code.
- Run `npm run check` before you ask for review.

## First steps

The [five-minute path in CONTRIBUTING.md](../CONTRIBUTING.md) walks through cloning, checking the baseline, branching, and opening a pull request. For a first substantive change, [add a lifecycle rule](../CONTRIBUTING.md#your-first-contribution-add-a-lifecycle-rule); rules are the most valuable contribution and the most self-contained.

## Ask

Questions and ideas belong in [GitHub Discussions](https://github.com/arminazimi/evergreen/discussions): **Q&A** to ask, **Ideas** to propose, and **Show and tell** to share what you built. Use issues for bugs, lifecycle rule proposals, and ecosystem requests.
