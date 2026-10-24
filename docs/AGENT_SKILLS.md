# Evergreen Agent Skill

Evergreen ships its general portable skill at `skills/evergreen-deprecation/SKILL.md`, plus focused ecosystem Skills. It follows the open Agent Skills directory format: standard YAML frontmatter plus Markdown instructions. There is no vendor-specific manifest, invocation policy, tool allowlist, script, or generated prompt.

## Design

The skill is intentionally an orchestration layer. It tells an agent when to discover, explain, migrate, and verify, then maps those intents to Evergreen's MCP tools or CLI commands. Lifecycle rules, evidence, affected-file calculation, migration steps, and verification behavior remain in the executable and versioned JSON contracts.

This split prevents prompt drift: improving a detector or migration packet changes every client without requiring a rewritten skill.

## Installation

The skills CLI discovers the Skill directly from the Evergreen monorepo. No dedicated distribution repository is needed:

```sh
npx skills add arminazimi/evergreen
```

The repository exposes five Skills: the general `evergreen-deprecation` and one focused Skill per ecosystem (see [Ecosystem Skills](#ecosystem-skills)). For a non-interactive or explicitly selected install, use:

```sh
npx skills add arminazimi/evergreen --skill evergreen-deprecation --yes
```

Install a focused Skill the same way, for example `--skill evergreen-python`. Update one with:

```sh
npx skills update evergreen-deprecation
```

The npm package also includes the complete `skills/evergreen-deprecation` folder for hosts that prefer a manual copy or link.

The host also needs one Evergreen execution path:

- the local `evergreen-mcp` stdio server; or
- the `evergreen` CLI available on `PATH`.

No account or API key is required.

## Ecosystem Skills

A narrow Skill triggers more reliably and is easier to find than one general Skill. Each ecosystem Skill is a thin entry point to the same workflow: it tells the agent which findings to keep (by rule prefix), then calls the existing `evergreen` CLI or MCP tools. It adds no detector logic, scripts, or permissions.

| Skill | Covers | Finding filter |
| --- | --- | --- |
| `evergreen-nodejs` | Node.js runtimes and npm packages | `nodejs.`, `npm.` |
| `evergreen-python` | Python versions and PyPI packages | `python.` |
| `evergreen-github-actions` | Deprecated Actions and workflow runtimes | `github-actions.` |
| `evergreen-containers` | End-of-life base images (experimental detector) | `container.` |

They are canonical in `skills/` and are copied into both plugins by `npm run build:plugins`, so a plugin install carries all five. `tests/skill.test.ts` checks each one against the portable contract and `tests/plugin-packaging.test.ts` checks the generated copies.

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
