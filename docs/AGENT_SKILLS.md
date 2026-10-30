# Evergreen Agent Skills

Evergreen ships three portable Skills under `skills/`. Each follows the open Agent Skills directory format: standard YAML frontmatter plus Markdown instructions. There is no vendor-specific manifest, invocation policy, tool allowlist, script, or generated prompt.

| Skill | Directory | Moment |
| --- | --- | --- |
| `evergreen-deprecation` | `skills/evergreen-deprecation/` | Repository lifecycle scans and finding explain / migrate / verify workflows |
| `evergreen-check-before-add` | `skills/evergreen-check-before-add/` | Adding or choosing a package, runtime, or GitHub Action |
| `evergreen-upgrade-runtime-action` | `skills/evergreen-upgrade-runtime-action/` | Upgrading an already-declared runtime or GitHub Action |

## Design

Each Skill is an orchestration layer. It tells an agent when to act, then maps those intents to Evergreen's MCP tools or CLI commands. Lifecycle rules, evidence, affected-file calculation, migration steps, and verification behavior remain in the executable and versioned JSON contracts.

This split prevents prompt drift: improving a detector or migration packet changes every client without requiring a rewritten Skill. The descriptions name different moments on purpose so they do not compete for the same prompt.

## Installation

The skills CLI discovers the Skills directly from the Evergreen monorepo. No dedicated distribution repository is needed:

```sh
npx skills add arminazimi/evergreen
```

The repository exposes three Skills. For a non-interactive or explicitly selected install, use:

```sh
npx skills add arminazimi/evergreen --skill evergreen-deprecation --yes
npx skills add arminazimi/evergreen --skill evergreen-check-before-add --yes
npx skills add arminazimi/evergreen --skill evergreen-upgrade-runtime-action --yes
```

Update them with:

```sh
npx skills update evergreen-deprecation
npx skills update evergreen-check-before-add
npx skills update evergreen-upgrade-runtime-action
```

The npm package also includes the complete `skills/evergreen-deprecation`, `skills/evergreen-check-before-add`, and `skills/evergreen-upgrade-runtime-action` folders for hosts that prefer a manual copy or link.

To tell the agents working in any other project to check dependencies with Evergreen, copy the snippet in [examples/agents-snippet.md](../examples/agents-snippet.md) into `AGENTS.md`, `CLAUDE.md`, or a similar instruction file.

The host also needs one Evergreen execution path:

- the local `evergreen-mcp` stdio server; or
- the `evergreen` CLI available on `PATH`.

No account or API key is required.

## One-command install per host

Each host below gets the Skills with one install command. Claude Code and Codex also receive the local MCP server through the same plugin ([MCP](MCP.md#one-command-install-per-host)). Cursor and VS Code need the MCP server separately. Every command was run in a clean environment on 2026-10-29 (macOS, Node.js 22).

Shared verify prompt after install: ask the agent to `Add the request package to this project`, and confirm it checks `pkg:npm/request` (via `check_dependency` or `npx evergreen-deprecation check`) and reports the deprecation with a replacement and sources instead of adding the package.

### Claude Code

```sh
claude plugin install evergreen --marketplace arminazimi/evergreen
```

**Verify.** `claude plugin list` shows `evergreen@evergreen` enabled, and `claude plugin details evergreen` lists both Skills. Start a new session and use the shared verify prompt.

Portable skills-CLI alternative: `npx skills add arminazimi/evergreen --agent claude-code --yes`, then `npx skills list`.

### Codex

```sh
codex plugin marketplace add arminazimi/evergreen --ref main && codex plugin add evergreen@evergreen-codex
```

When the Evergreen repository marketplace is already configured, `codex plugin add evergreen@evergreen-codex` alone is enough.

**Verify.** Restart the Codex session, run `codex plugin list --json`, and confirm `evergreen@evergreen-codex` is installed. Then use the shared verify prompt.

Portable skills-CLI alternative: `npx skills add arminazimi/evergreen --agent codex --yes`, then `npx skills list`.

### Cursor

```sh
npx skills add arminazimi/evergreen --agent cursor --yes
```

**Verify.** `npx skills list` shows `evergreen-deprecation`, `evergreen-check-before-add`, and `evergreen-upgrade-runtime-action`. Restart Cursor, then use the shared verify prompt. For the MCP server, see [MCP](MCP.md#one-command-install-per-host).

### VS Code

VS Code Copilot Chat picks up the Skills through the skills CLI's `github-copilot` target:

```sh
npx skills add arminazimi/evergreen --agent github-copilot --yes
```

**Verify.** `npx skills list` shows all three Skills. Reload the VS Code window, open Copilot Chat in Agent mode, then use the shared verify prompt. For the MCP server, see [MCP](MCP.md#one-command-install-per-host).

## One Skill for every ecosystem

Evergreen briefly shipped four per-ecosystem Skills (Node.js, Python, GitHub Actions, containers) and removed them in favor of the lifecycle Skill. They were near-copies that differed only by a rule-prefix filter, so every workflow change had to be made five times, they could trigger together on one request, and they covered four of the ecosystems Evergreen supports. The claim that narrower descriptions trigger more reliably was never measured for that split. Later Skills split by *moment*, not ecosystem: `evergreen-check-before-add` for adding a dependency, and `evergreen-upgrade-runtime-action` for upgrading an already-declared runtime or GitHub Action after the upgrade-job eval showed misses (see below). If a measurement shows a gain from ecosystem splits, split by ecosystem then.

The ecosystem-specific cautions live in the lifecycle Skill's "Ecosystem notes".

## Use the guardrail in this repository

Agents working on Evergreen itself follow the same rule the check-before-add Skill teaches: run `evergreen check <purl>` before adding any dependency, runtime, or Action. Install the Skills as above, or run the check from source, which needs nothing else:

```sh
npm run dev -- check pkg:npm/request@2.88.2
```

The rule is stated for contributors in [AGENTS.md](../AGENTS.md#dependencies), and the `self-scan` CI job backs it up by failing on any finding the baseline does not cover (see [ADOPTION.md](ADOPTION.md#scanning-this-repository)).

## Discovery and host compatibility

On 2026-10-15, `npx skills add arminazimi/evergreen --list` discovered the `evergreen-deprecation` Skill. A clean project installation then selected and installed that Skill for five representative skills CLI targets:

| Host | `--agent` value | Install result |
| --- | --- | --- |
| Codex | `codex` | Passed |
| Claude Code | `claude-code` | Passed |
| Cursor | `cursor` | Passed |
| GitHub Copilot | `github-copilot` | Passed |
| Gemini CLI | `gemini-cli` | Passed |

The same install registered the Skill with skills.sh. It is discoverable as `arminazimi/evergreen@evergreen-deprecation` at [skills.sh](https://skills.sh/arminazimi/evergreen/evergreen-deprecation). The repository lists three Skills once published (`evergreen-check-before-add` and `evergreen-upgrade-runtime-action` alongside it). The skills CLI security summary reported Gen Agent Trust Hub **Safe**, Socket **0 alerts**, and Snyk **Low Risk** at validation time. These external assessments can change and do not replace review of the installed files.

## Evaluation

### Lifecycle Skill (`evergreen-deprecation`)

Trigger evaluation cases live in `skills/evergreen-deprecation/evals/cases.json`. The versioned corpus contains 114 prompts: 54 expected triggers and 60 expected non-triggers, including 24 deliberately ambiguous requests and six add-a-dependency prompts that must not select this Skill. Each of the `agent-skills`, `codex`, and `claude` discovery lanes has 38 cases.

Run the deterministic metadata-selection proxy from the repository root:

```sh
npm run eval:skill-triggers
```

The command builds the evaluator, prints JSON results overall and by host lane, lists any failed case IDs, and exits unsuccessfully when the corpus has fewer than 50 cases, recall is below 90%, or the false-trigger rate is 5% or higher. It has no model, network, account, or API-key dependency, so CI and contributors can reproduce the same baseline.

Current published baseline:

| Lane | Cases | Recall | False-trigger rate |
| --- | ---: | ---: | ---: |
| All | 114 | 100% | 0% |
| Agent Skills | 38 | 100% | 0% |
| Codex | 38 | 100% | 0% |
| Claude | 38 | 100% | 0% |

### Tuning the description

The first published corpus was written against the description's concepts, so it passed completely and could not show whether the wording covered everyday requests. Expanding it to 108 cases exposed both directions of the problem:

| Measurement | Cases | Recall | False-trigger rate |
| --- | ---: | ---: | ---: |
| Previous description, expanded corpus | 108 | 79.6% | 7.4% |
| Tuned description and proxy | 108 | 100% | 0% |

Fifteen cases failed before the change. Eleven trigger requests missed because the description did not name support and maintenance status, container base images, or finding and verification work without the product name. Four non-goals falsely triggered because "deprecated" plus a manifest or a supported runtime was enough to cross the boundary, even when the request was about an npm script, a React hook, a Python function, or a Node API. The revised description states those boundaries, and the deterministic proxy that encodes it now requires a lifecycle status before a source-API or configuration request counts as a trigger. The gates are unchanged.

This is a contract test for the concepts exposed by the skill metadata, not a claim that every model version will make an identical routing decision. Live host checks can add observations without weakening the deterministic CI gate. Generic dependency upgrades, vulnerability or security audits, deprecated source APIs, project scripts, configuration, and unrelated modernization are explicit negative cases.

### Check-before-add Skill (`evergreen-check-before-add`)

`skills/evergreen-check-before-add/evals/cases.json` measures the add-a-dependency moment: 54 prompts, 27 expected checks and 27 that should not trigger one, split evenly across the three discovery lanes. Positives add or choose a dependency in npm, PyPI, and GitHub Actions terms (`npm install request-promise`, `Add actions/checkout@v4 to the CI workflow`, `Which package should I use for date handling?`). Negatives are removals, installs of what the lockfile already declares, routine upgrades, `dependency injection`, tests, documentation, refactors, and repository lifecycle prompts that belong to `evergreen-deprecation`.

`npm run eval:skill-triggers` reports recall and false-trigger rate for it under `dependencyGuard` (skill `evergreen-check-before-add`), overall and by lane, with the same gates (at least 40 cases, recall of 90% or more, false-trigger rate under 5%). It also fails when either Skill's positive prompts falsely trigger the other Skill's classifier (`separation` in the JSON output).

Current published baseline:

| Lane | Cases | Recall | False-trigger rate |
| --- | ---: | ---: | ---: |
| All | 54 | 100% | 0% |
| Agent Skills | 18 | 100% | 0% |
| Codex | 18 | 100% | 0% |
| Claude | 18 | 100% | 0% |

### Upgrade runtime or Action Skill (`evergreen-upgrade-runtime-action`)

Issue #1598 asked whether to split further Skills for runtime upgrades and GitHub Actions upgrades. The decision corpus is the 24 positive prompts in `skills/evergreen-upgrade-runtime-action/evals/cases.json` (12 runtime, 12 Actions; natural phrasing and lifecycle-worded asks, split across the three discovery lanes). Measuring `evergreen-deprecation` alone on those prompts:

| Measurement | Cases | Covered by `evergreen-deprecation` | Rate | Threshold | Decision |
| --- | ---: | ---: | ---: | ---: | --- |
| Runtime and GitHub Actions upgrade job | 24 | 12 | 50% | 80% | Added `evergreen-upgrade-runtime-action` |

Misses were everyday upgrade asks without lifecycle jargon (`Upgrade our Node.js runtime to the current LTS.`, `Bump actions/checkout and actions/setup-node.`, and ten peers). Lifecycle-worded upgrades still hit the existing Skill; the new Skill names the upgrade moment so those misses are covered without an ecosystem split.

The same JSON file is the Skill's own trigger corpus: 42 prompts, 24 expected triggers and 18 non-triggers (additions, whole-repo scans, routine package bumps, security, docs, and verification). `npm run eval:skill-triggers` reports it under `upgradeRuntimeAction` with the same gates (at least 40 cases, recall of 90% or more, false-trigger rate under 5%) and fails when its positives falsely trigger the check-before-add classifier or the reverse.

Current published baseline:

| Lane | Cases | Recall | False-trigger rate |
| --- | ---: | ---: | ---: |
| All | 42 | 100% | 0% |
| Agent Skills | 14 | 100% | 0% |
| Codex | 14 | 100% | 0% |
| Claude | 14 | 100% | 0% |

CI also validates the portable frontmatter, small instruction surface, vendor neutrality, complete tool mapping, and safety invariants.

Independent forward tests exercise three different agent situations:

| Agent situation | Observable success criterion | Result |
| --- | --- | --- |
| Skill discovery | Classify every trigger and non-trigger case through the metadata contract without reading expected answers. | Lifecycle, check-before-add, and upgrade-runtime-action corpora all pass across three lanes. |
| MCP-capable agent | Discover, explain, create context, migrate, and verify through the real stdio protocol in one session. | Passed with all five tools; checkout finding verified absent. |
| CLI-only agent | Complete the same lifecycle using only documented CLI fallbacks and a fresh final scan. | Passed; request migration changed only two packet files and ended with zero findings. |

Forward-test observations are recorded on the Week 11 GitHub issue when the phase is completed. Discovery testing narrowed an ambiguous generic migration trigger to migrations from Evergreen findings. CLI testing replaced the packet's `npx` rescan suggestion with the already-installed `evergreen` executable so verification remains offline-capable and version-consistent. MCP testing clarified that an empty usage list means there are no additional usages beyond the declaration, rather than implying that the declaration itself is not relevant.

## Limits and security assumptions

- Evergreen currently covers its documented GitHub Actions, Node.js, npm, and Python rules. The Skills report unsupported ecosystems instead of inventing migration advice.
- Dynamic references that detectors cannot classify remain explicit limitations.
- MCP verification needs the same server session that observed the finding. The CLI fallback uses a fresh scan and conservatively compares the rule and declaration path.
- The Skills grant no permissions. Suggested verification commands remain subject to the host's normal authorization rules.
- The bundles contain no executable skill scripts and declare no pre-approved tools.
- Installing through the skills CLI copies or links instruction files into the selected host's Skill directory; it does not install the Evergreen runtime itself.
- Repository analysis remains local. The selected host receives structured Evergreen results, which can include paths and short source excerpts, so its own privacy policy still applies.
