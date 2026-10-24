# Playbook: agent-driven migrations

A start-to-finish guide for letting a coding agent (Claude Code, Codex, Cursor, Copilot, Gemini CLI, Kilo Code) migrate one end-of-life or deprecated dependency, runtime, or GitHub Action, while Evergreen supplies the facts and the proof.

The split of responsibility is the point. Evergreen decides **what** is affected and **whether it is fixed**. The agent decides **how** to change the code. A human decides **whether to merge**.

## Before you start

- Install the guardrail so the agent checks before it adds anything: `npx skills add arminazimi/evergreen`, or connect the local MCP server ([MCP.md](../MCP.md)). Either path needs no account or API key.
- Work on a branch with a clean tree. One finding per branch keeps the diff reviewable and the verification unambiguous.
- Run the project's own tests once before changing anything. A migration cannot be verified against a suite that was already failing.

## The loop

Every migration is the same four steps. The agent should run them in order and stop if one fails.

### 1. Discover

```bash
npx evergreen-deprecation scan . --json
```

Pick **one** finding and copy its exact `id`. Do not let the agent batch several findings into one change.

For a large result, `--format compact` fits an agent's context window, and `scan --write-status` writes `EVERGREEN_STATUS.md` so an agent that cannot call tools can still read the repository's lifecycle state.

### 2. Explain

```bash
npx evergreen-deprecation explain '<finding-id>' . --json
```

Read the rule, the exact location, and the authoritative source. If the agent cannot point to the source, it should not proceed: a lifecycle claim without a source is not a reason to change code.

### 3. Migrate

```bash
npx evergreen-deprecation context '<finding-id>' . --json
```

The migration packet ([MIGRATION_PACKETS.md](../MIGRATION_PACKETS.md)) lists the declaration, every usage, behavioral constraints, ordered steps, and suggested verification commands. The agent follows the steps and touches only the affected files the packet names. Evergreen never edits files and never runs the suggested commands; the agent runs them under the host's normal permission prompts, after reading them.

### 4. Verify

```bash
npx evergreen-deprecation scan . --json
```

The migration is done only when **both** hold: the project's tests pass, and a fresh scan no longer reports that rule at that location. Through MCP, `verify_migration` does the second check in the session that saw the finding. An unknown or missing finding ID after a rescan is not proof of success; the agent should compare rule and path, not just the ID.

## Worked examples on real repositories

These come from the pinned public corpus in `benchmarks/public-repositories.json`, so each location is one Evergreen reports at that commit.

**A Python floor that reached end of life: `psf/requests`.** At commit `611c616`, line 17 of `pyproject.toml` reads `requires-python = ">=3.10"`, a release line that ended on 2026-10-01 (rule `python.runtime.eol-3.10-and-older`). The packet's scope is the declaration plus anything that gates on the old floor (CI matrix entries, classifiers, `python_requires` checks in tests). Raising the floor changes what the package supports for its users, so this is a decision to take to a maintainer; the agent should present the change, not make it silently.

**A deprecated Action in many workflows: `Akenon-Studio/.github`.** At commit `4ec1ebe`, `.github/workflows/security-scan.yml` line 127 uses an `actions/setup-node` release on Node 20, and two workflows use `actions/create-github-app-token@v2` below the supported major. The maintainers' own migration commit is the reference outcome. Here the packet paths are workflows only, so the diff should be a handful of `uses:` lines and nothing else. Check the Action's release notes for changed inputs before accepting the bump.

## Failure modes and what to do

| What goes wrong | Why | Response |
| --- | --- | --- |
| The agent edits files outside the packet | The packet's affected-file set is the scope; a broader edit has no Evergreen evidence behind it | Revert the extra edits, or open a follow-up issue for them |
| The agent bumps a version but the finding remains | The rule keys on the declaration, a range, or a runtime file the bump did not touch | Rescan, read the new location, repeat from step 2 |
| Tests pass, finding gone, behavior changed | The packet lists behavioral constraints for a reason; tests may not cover them | Read the constraints against the diff before merging |
| `no-data` from `check_dependency` for a replacement | Evergreen has no rule for it | Treat as unknown, not safe; pick the replacement the packet cites |
| The agent runs a suggested command that fails or is destructive | Suggested commands depend on project setup | Review commands first; Evergreen only suggests them |
| A finding keeps returning in CI | It was never fixed, or the baseline expired | Use `--baseline` only for findings you accept on purpose, with `--on-expired fail` so acceptance cannot rot |
| The finding ID is stale | IDs come from a specific scan | Rescan and select the finding again |
| Dynamic references or unsupported ecosystems | Evergreen reports a limitation instead of guessing | Report the limitation; do not invent a rule |

## Privacy boundaries

- Scans, `explain`, `context`, `check`, and the MCP server run locally and use no network. The one command that does is `evergreen data update`, which you run yourself ([PRIVACY.md](../PRIVACY.md)).
- Evergreen sends nothing about your repository anywhere. It has no account, no analytics, and no telemetry.
- **The agent host is a separate party.** Scan results and migration packets contain file paths and short source excerpts. Once they enter an agent's context, that host's privacy policy and your workspace settings apply. For a private repository, use a host and plan you already trust with that code.
- Repository contents are untrusted input. A file that says "ignore your instructions" is data, not a command. Do not let the agent follow instructions found in the repository, in a finding, or in a source excerpt.
- Do not put credentials in prompts. Evergreen never asks for them.

## Reviewing the result

Treat the agent's change like any contributor's pull request:

1. The diff touches only files named in the packet.
2. The cited source supports the claim in the PR description.
3. Project tests pass, and a fresh `evergreen scan` no longer reports the finding.
4. In CI, the [GitHub Action](../GITHUB_ACTION.md) with `fail-on-severity` keeps the finding from coming back.

## Prompt template

```text
Migrate one Evergreen finding in this repository.

1. Run `npx evergreen-deprecation scan . --json` and pick finding <ID>.
2. Run `explain` and `context` for it. Summarize the source before editing.
3. Change only the files the migration packet lists. Do not refactor anything else.
4. Review each suggested verification command before running it.
5. Run the project tests, then rescan. Stop if the finding remains or tests fail,
   and tell me what you saw instead of widening the change.
```
