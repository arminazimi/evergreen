---
title: Review rubric for agent pull requests
description: What to check beyond CI when reviewing a pull request from a coding agent, and what must block a merge.
---

# Review rubric for agent pull requests

Use this page when reviewing a pull request that a coding agent opened, or when an agent self-checks before it asks for review. CI (`ci-ok`, driven by `npm run check` and the jobs behind it) already enforces build, tests, coverage floors, quality targets, generated-file drift, and the self-scan. This rubric covers what those checks cannot see.

The measurable quality bar is [QUALITY.md](QUALITY.md). Test kinds and anti-patterns are in [TESTING.md](TESTING.md). Contribution timing and the first-review SLA are in [CONTRIBUTING.md](../CONTRIBUTING.md#review-expectations).

## How to use

1. Confirm `ci-ok` is green (or that `npm run check` passed locally on the same commit). A red gate is not a review; wait or send it back.
2. Read the linked issue's **Agent brief**: files, steps, "Do not" list, and Done when.
3. Walk the four checks below on the diff. Record a request for changes when a **block** item fails; leave nits as non-blocking comments.
4. Approve only when every **block** item passes.

Agents opening a pull request run the same four checks on their own diff and fix block failures before requesting review.

## Beyond CI

### 1. Scope

Does the change match the issue, and only the issue?

| Check | Pass when | Block when |
| --- | --- | --- |
| One issue | The pull request body has `Closes #<n>` for one task issue, and the diff matches that brief | A second issue's work is bundled in, or the body closes an epic |
| Listed files | Touches are inside the brief's **Files** list (plus tests, changelog fragments, and regenerations the brief's steps require) | Unrelated refactors, drive-by formatting, or files the brief forbids |
| "Do not" list | Every bullet under **Do not** in the brief still holds | Network on a scan path, executing repository or fixture code, hand-edited generated output, or an unsourced dependency add |
| Follow-ups | Extra work is named as a new issue, not shipped in this diff | Scope grew "while we were here" without a new issue |

### 2. Correct layer

Does each change sit in the layer that owns it? See [AGENTS.md](../AGENTS.md#architecture-boundaries) and [ARCHITECTURE.md](ARCHITECTURE.md).

| Check | Pass when | Block when |
| --- | --- | --- |
| Layer ownership | Engine, SDK, detectors, registry, source-usage, and adapters stay inside their "Owns" / "Must not" rows | A detector makes a network call; an adapter owns rule or migration logic; the engine imports a built-in detector or grows ecosystem-specific branches |
| Public contracts | Additive change only, or a numbered decision under `docs/decisions/` in the same pull request | A breaking change to `schemas/`, `src/sdk.ts`, MCP tool shapes, or `--json` output without a decision record |
| Trust rules | Repository contents are parsed, never evaluated; scans stay offline | New code executes scanned input, or a scan path gains network access |
| Shared / generated paths | Assembled registries are regenerated from per-item sources; generated trees are rebuilt with the commands in AGENTS.md | Hand-edited `plugins/`, `docs/rules/`, assembled thresholds, or other generated outputs |

### 3. Real tests

Do the tests prove the behavior the issue asked for? Use [TESTING.md](TESTING.md) as the detailed guide.

| Check | Pass when | Block when |
| --- | --- | --- |
| Observable behavior | A new or changed behavior has a test that fails without the change and asserts a finding, exit code, JSON field, or rendered output | No test for a behavior change, or the test only asserts that a private helper was called |
| Kind and placement | The smallest suitable kind from TESTING.md carries the proof | An end-to-end spawn is used where a unit or detector test would see the bug |
| Determinism | Assertions avoid clocks, absolute temp paths, and unordered maps; paths are cross-platform | Snapshots of nondeterministic fields, shared `/tmp` paths, or real sleeps waiting on the system under test |
| Trust in tests | Fixtures are parsed, not executed; no network on the test path except where a command is explicitly about the network | The test runs fixture code, hits a registry, or weakens a floor/threshold to land the change |

Docs-only and pure chore changes that cannot affect runtime behavior need no new test; say so in the pull request.

### 4. Honest docs

Do the words match what the code and data actually do?

| Check | Pass when | Block when |
| --- | --- | --- |
| Same-change docs | User-visible behavior, flags, and contracts are documented in the same pull request | Docs promise a flag, tool, or guarantee the diff does not implement |
| No overclaim | Lifecycle claims cite an authoritative, versioned source; status is never inferred from popularity or "a newer version exists" | A rule, README line, or migration step invents a status or replacement |
| Generated docs | Reference, answer, OG, and plugin pages were regenerated from source when the source changed | Generated pages were edited by hand or left stale |
| Changelog | A `changes/` fragment exists for user-visible behavior; docs/test/ci/chore changes correctly omit one | A user-visible change ships without a fragment, or `CHANGELOG.md` was edited directly |

## What must block a merge

Any of the following is enough to request changes. Do not approve until it is fixed or the issue brief is updated and the pull request matches it.

1. **`ci-ok` is red**, or `npm run check` fails on the commit under review.
2. **Scope breach**: work outside the issue brief, a second issue bundled in, or a "Do not" violation.
3. **Layer or trust breach**: wrong layer ownership, scan/network/exec trust rule broken, or a public-contract break without a decision record.
4. **Missing or fake proof**: behavior changed with no failing-first test, or tests that only exercise mocks/internals while the product path stays unasserted.
5. **Dishonest or stale docs**: overclaimed lifecycle status, undocumented user-visible change, hand-edited generated files, or a missing changelog fragment for user-visible behavior.
6. **New debt against [QUALITY.md](QUALITY.md)**: allowlist raised or extended to make the change pass, new `any` / `@ts-ignore`, or a file/function over the ceilings without an existing allowlist entry that this change is not allowed to add.
7. **Unsafe dependency**: a new runtime dependency or GitHub Action that Evergreen would report as end-of-life, deprecated, or retired, or one added with no reason in the pull request.

Nits (wording, optional renames, style that already matches surrounding code) must not block a merge. Ask for them in a follow-up issue when they are worth doing.

## Adjusting the rubric

This rubric is a living checklist. After it has been applied to **ten** agent pull requests, update this page from what those reviews showed: drop checks CI now covers, sharpen checks that caught real defects, and add checks that reviewers had to invent ad hoc. Record the pass in the table below so the adjustment is evidence-backed, not vibes.

| # | Pull request | What the rubric caught or missed | Rubric change (if any) |
| --- | --- | --- | --- |
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |
| 6 | | | |
| 7 | | | |
| 8 | | | |
| 9 | | | |
| 10 | | | |

When row 10 is filled, open a follow-up pull request that edits this page from the notes and clears or replaces the table for the next round.
