# Evergreen Agent Skill

Evergreen ships one portable skill at `skills/evergreen-deprecation/SKILL.md`. It follows the open Agent Skills directory format: standard YAML frontmatter plus Markdown instructions. There is no vendor-specific manifest, invocation policy, tool allowlist, script, or generated prompt.

## Design

The skill is intentionally an orchestration layer. It tells an agent when to discover, explain, migrate, and verify, then maps those intents to Evergreen's MCP tools or CLI commands. Lifecycle rules, evidence, affected-file calculation, migration steps, and verification behavior remain in the executable and versioned JSON contracts.

This split prevents prompt drift: improving a detector or migration packet changes every client without requiring a rewritten skill.

## Installation

The skills CLI discovers the Skill directly from the Evergreen monorepo. No dedicated distribution repository is needed:

```sh
npx skills add arminazimi/evergreen
```

The repository currently exposes one Skill. For a non-interactive or explicitly selected install, use:

```sh
npx skills add arminazimi/evergreen --skill evergreen-deprecation --yes
```

Update it with:

```sh
npx skills update evergreen-deprecation
```

The npm package also includes the complete `skills/evergreen-deprecation` folder for hosts that prefer a manual copy or link.

To tell the agents working in any other project to check dependencies with Evergreen, copy the snippet in [examples/agents-snippet.md](../examples/agents-snippet.md) into `AGENTS.md`, `CLAUDE.md`, or a similar instruction file.

The host also needs one Evergreen execution path:

- the local `evergreen-mcp` stdio server; or
- the `evergreen` CLI available on `PATH`.

No account or API key is required.

## One-command install per host

Each host below gets the Skill with one install command. Claude Code and Codex also receive the local MCP server through the same plugin ([MCP](MCP.md#one-command-install-per-host)). Cursor and VS Code need the MCP server separately. Every command was run in a clean environment on 2026-10-29 (macOS, Node.js 22).

Shared verify prompt after install: ask the agent to `Add the request package to this project`, and confirm it checks `pkg:npm/request` (via `check_dependency` or `npx evergreen-deprecation check`) and reports the deprecation with a replacement and sources instead of adding the package.

### Claude Code

```sh
claude plugin install evergreen --marketplace arminazimi/evergreen
```

**Verify.** `claude plugin list` shows `evergreen@evergreen` enabled, and `claude plugin details evergreen` lists the `evergreen-deprecation` Skill. Start a new session and use the shared verify prompt.

Portable skills-CLI alternative: `npx skills add arminazimi/evergreen --agent claude-code --skill evergreen-deprecation --yes`, then `npx skills list`.

### Codex

```sh
codex plugin marketplace add arminazimi/evergreen --ref main && codex plugin add evergreen@evergreen-codex
```

When the Evergreen repository marketplace is already configured, `codex plugin add evergreen@evergreen-codex` alone is enough.

**Verify.** Restart the Codex session, run `codex plugin list --json`, and confirm `evergreen@evergreen-codex` is installed. Then use the shared verify prompt.

Portable skills-CLI alternative: `npx skills add arminazimi/evergreen --agent codex --skill evergreen-deprecation --yes`, then `npx skills list`.

### Cursor

```sh
npx skills add arminazimi/evergreen --agent cursor --skill evergreen-deprecation --yes
```

**Verify.** `npx skills list` shows `evergreen-deprecation`. Restart Cursor, then use the shared verify prompt. For the MCP server, see [MCP](MCP.md#one-command-install-per-host).

### VS Code

VS Code Copilot Chat picks up the Skill through the skills CLI's `github-copilot` target:

```sh
npx skills add arminazimi/evergreen --agent github-copilot --skill evergreen-deprecation --yes
```

**Verify.** `npx skills list` shows `evergreen-deprecation`. Reload the VS Code window, open Copilot Chat in Agent mode, then use the shared verify prompt. For the MCP server, see [MCP](MCP.md#one-command-install-per-host).

## One Skill for every ecosystem

Evergreen briefly shipped four per-ecosystem Skills (Node.js, Python, GitHub Actions, containers) and removed them in favor of this one. They were near-copies of this Skill that differed only by a rule-prefix filter, so every workflow change had to be made five times, they could trigger together on one request, and they covered four of the ecosystems Evergreen supports. The claim that narrower descriptions trigger more reliably was never measured: the trigger evaluation covers only this Skill. If a measurement shows a gain, split by ecosystem then.

The ecosystem-specific cautions live in this Skill's "Ecosystem notes".

## Use the guardrail in this repository

Agents working on Evergreen itself follow the same rule the Skill teaches: run `evergreen check <purl>` before adding any dependency, runtime, or Action. Install the Skill as above, or run the check from source, which needs nothing else:

```sh
npm run dev -- check pkg:npm/request@2.88.2
```

The rule is stated for contributors in [AGENTS.md](../AGENTS.md#dependencies), and the `self-scan` CI job backs it up by failing on any finding the baseline does not cover (see [ADOPTION.md](ADOPTION.md#scanning-this-repository)).

## Discovery and host compatibility

On 2026-10-15, `npx skills add arminazimi/evergreen --list` discovered exactly one Skill named `evergreen-deprecation`. A clean project installation then selected and installed that Skill for five representative skills CLI targets:

| Host | `--agent` value | Install result |
| --- | --- | --- |
| Codex | `codex` | Passed |
| Claude Code | `claude-code` | Passed |
| Cursor | `cursor` | Passed |
| GitHub Copilot | `github-copilot` | Passed |
| Gemini CLI | `gemini-cli` | Passed |

The same install registered the Skill with skills.sh. It is discoverable as `arminazimi/evergreen@evergreen-deprecation` at [skills.sh](https://skills.sh/arminazimi/evergreen/evergreen-deprecation). The skills CLI security summary reported Gen Agent Trust Hub **Safe**, Socket **0 alerts**, and Snyk **Low Risk** at validation time. These external assessments can change and do not replace review of the installed files.

## Evaluation

Trigger evaluation cases live in `skills/evergreen-deprecation/evals/cases.json`. The versioned corpus contains 60 prompts: 30 expected triggers and 30 expected non-triggers, including 12 deliberately ambiguous requests. Each of the `agent-skills`, `codex`, and `claude` discovery lanes has 20 cases with an even positive/negative split.

Run the deterministic metadata-selection proxy from the repository root:

```sh
npm run eval:skill-triggers
```

The command builds the evaluator, prints JSON results overall and by host lane, lists any failed case IDs, and exits unsuccessfully when the corpus has fewer than 50 cases, recall is below 90%, or the false-trigger rate is 5% or higher. It has no model, network, account, or API-key dependency, so CI and contributors can reproduce the same baseline.

Current published baseline:

| Lane | Cases | Recall | False-trigger rate |
| --- | ---: | ---: | ---: |
| All | 60 | 100% | 0% |
| Agent Skills | 20 | 100% | 0% |
| Codex | 20 | 100% | 0% |
| Claude | 20 | 100% | 0% |

This is a contract test for the concepts exposed by the skill metadata, not a claim that every model version will make an identical routing decision. Live host checks can add observations without weakening the deterministic CI gate. Generic dependency upgrades, vulnerability or security audits, deprecated application APIs, and unrelated modernization are explicit negative cases.

### Dependency guard evaluation

The Skill also tells an agent to check a package, runtime, or action before adding it (`check_dependency` or `evergreen check`). `skills/evergreen-deprecation/evals/dependency-cases.json` measures that trigger: 48 prompts, 27 expected checks and 21 that should not trigger one, split evenly across the three discovery lanes. Positives add or choose a dependency in npm, PyPI, and GitHub Actions terms (`npm install request-promise`, `Add actions/checkout@v4 to the CI workflow`, `Which package should I use for date handling?`). Negatives are removals, installs of what the lockfile already declares, routine upgrades, `dependency injection`, tests, documentation, and refactors; six edge cases are labeled ambiguous with the decision and reason recorded.

`npm run eval:skill-triggers` reports recall and false-trigger rate for it under `dependencyGuard`, overall and by lane, with the same gates (at least 40 cases, recall of 90% or more, false-trigger rate under 5%). Like the lifecycle evaluation it is a deterministic proxy for what the Skill metadata says, not a measurement of any particular model; live runs in each host can add observations without weakening the gate.

CI also validates the portable frontmatter, small instruction surface, vendor neutrality, complete tool mapping, and safety invariants.

Independent forward tests exercise three different agent situations:

| Agent situation | Observable success criterion | Result |
| --- | --- | --- |
| Skill discovery | Classify every trigger and non-trigger case through the metadata contract without reading expected answers. | 60/60 correct across three lanes. |
| MCP-capable agent | Discover, explain, create context, migrate, and verify through the real stdio protocol in one session. | Passed with all five tools; checkout finding verified absent. |
| CLI-only agent | Complete the same lifecycle using only documented CLI fallbacks and a fresh final scan. | Passed; request migration changed only two packet files and ended with zero findings. |

Forward-test observations are recorded on the Week 11 GitHub issue when the phase is completed. Discovery testing narrowed an ambiguous generic migration trigger to migrations from Evergreen findings. CLI testing replaced the packet's `npx` rescan suggestion with the already-installed `evergreen` executable so verification remains offline-capable and version-consistent. MCP testing clarified that an empty usage list means there are no additional usages beyond the declaration, rather than implying that the declaration itself is not relevant.

## Limits and security assumptions

- Evergreen currently covers its documented GitHub Actions, Node.js, npm, and Python rules. The skill reports unsupported ecosystems instead of inventing migration advice.
- Dynamic references that detectors cannot classify remain explicit limitations.
- MCP verification needs the same server session that observed the finding. The CLI fallback uses a fresh scan and conservatively compares the rule and declaration path.
- The skill grants no permissions. Suggested verification commands remain subject to the host's normal authorization rules.
- The bundle contains no executable skill scripts and declares no pre-approved tools.
- Installing through the skills CLI copies or links instruction files into the selected host's Skill directory; it does not install the Evergreen runtime itself.
- Repository analysis remains local. The selected host receives structured Evergreen results, which can include paths and short source excerpts, so its own privacy policy still applies.
