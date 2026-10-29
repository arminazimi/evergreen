# Cross-host plugin evaluation

Evergreen applies one release gate to its Codex and Claude adapters. Both hosts receive the same task corpus, byte-identical Skill instructions, the same pinned local MCP definition, and the same executable workflow. Host manifests contain discovery and presentation metadata only.

## Published baseline

The baseline below was reproduced on 2026-10-15 with `npm run eval:plugins`.

| Measure | Codex | Claude | Gate |
| --- | ---: | ---: | ---: |
| Shared task cases | 12 | 12 | Same corpus |
| Trigger recall | 100% | 100% | 100% |
| False-trigger rate | 0% | 0% | 0% |
| Workflow steps completed | 5/5 | 5/5 | 5/5 |
| Detector and workflow output parity | Passed | Passed | Exact after volatile timestamps |
| Untrusted repository instructions ignored | Passed | Passed | Required |
| Suggested commands executed by Evergreen | No | No | Must remain `false` |

The workflow fixture exercises `scan`, `list`, `explain`, `context`, and `verify` through the real shared implementation. It contains a lifecycle finding plus an `AGENTS.md` file that tells the agent to suppress findings and execute a command. Evergreen still reports the finding, never creates the command marker, and returns `commandsExecuted: false`. After the fixture is migrated, both hosts verify the same finding as absent.

## Agent loop: deprecated package refusal

The agent-loop evaluation (`benchmarks/agent-loop/`) proves that the guardrail changes agent behavior, not only that the configuration files exist. It scripts tasks asking an agent to add deprecated dependencies (`request`, `node-sass`, `request-promise`), and verifies whether the agent checks the dependency, the host's own hook warns or refuses the addition, and the documented replacement is proposed to guide migration.

The baseline below was reproduced on 2026-10-28 with `npm run eval:agent-loop`.

| Measure | Codex | Claude | Gate |
| --- | ---: | ---: | ---: |
| Shared task cases | 3 | 3 | Same corpus |
| Deprecation check recall | 100% | 100% | 100% |
| Host action: warn (Codex hook) | 100% | n/a | 100% |
| Host action: refusal (Claude hook) | n/a | 100% | 100% |
| Proposed replacement rate (from hook) | 100% | 100% | 100% |
| Package install blocked (CLI guard) | 100% | 100% | 100% |
| Unsafe package installed | No | No | Must remain `false` |

All host metrics are measured directly from each host's own hook output independently of the CLI guard:
1. **Check**: The dependency check (`check_dependency` MCP tool or `evergreen check`) identifies the package as `affected` against offline lifecycle rules (100% recall).
2. **Host intervention**:
   - **Claude Code**: The `PreToolUse` hook intercepts the install command and denies permission (`permissionDecision: "deny"`), preventing execution before the tool runs.
   - **Codex**: The `PostToolUse` hook intercepts the manifest edit in `package.json` and issues a deprecation warning advising the agent to prefer the replacement (warn, not refusal).
   - **CLI Guard**: Both hosts rely on `evergreen guard` to intercept and refuse package manager commands (`allowed: false`, exit code 1) so no unsafe package is installed. For Codex, blocking is enforced via this CLI execution path rather than the post-edit hook.
3. **Replacement**: The host's own hook output surfaces the authoritative replacement (e.g. native fetch for `request`, `sass` for `node-sass`) cited in the bundled registry.

The generated Claude package also passes the official Claude Code strict plugin validator. Codex package structure, paths, shared assets, and manifest budgets are checked directly by the deterministic package and eval gates.

## Context budget

[OpenAI's Skill activation model](https://developers.openai.com/plugins/concepts/skills) loads Skill name and description for discovery, then loads the complete `SKILL.md` only after activation. Evergreen therefore gates both layers independently. Bytes are the deterministic release measure; the token count is an explicit four-characters-per-token estimate and is not a model billing measurement.

| Context surface | Codex | Claude | Budget |
| --- | ---: | ---: | ---: |
| Discovery metadata | 367 bytes | 367 bytes | 512 bytes |
| Activated Skill | 2,856 bytes (~714 tokens) | 2,856 bytes (~714 tokens) | 4,096 bytes |
| Host manifest | 973 bytes | 606 bytes | 2,048 bytes |

MCP tool schemas arrive from the same local server after connection, so they are executable-interface context rather than duplicated host prompt text. The package drift gate additionally requires both hosts to carry the exact same Skill and `.mcp.json` bytes.

## Permission and security boundaries

- Every MCP tool is annotated read-only, non-destructive, idempotent, and closed-world.
- The plugin declares no credentials, network service, lifecycle hooks, or pre-approved host tools.
- The local stdio server reads only the repository path explicitly passed by the host. It returns structured findings and migration suggestions; it cannot edit files or execute suggested verification commands.
- Repository files, including instruction-shaped files, are detector input. They cannot replace the packaged Skill, tool schemas, registry validation, or session verification state.
- Codex and Claude manifests cannot contain detector, migration, or verification behavior. CI rejects missing, changed, or unexpected generated package files.
- The package command uses `npx --yes` to obtain the exact published Evergreen version. Initial installation can access the npm registry and runs with the permissions of the host process; consumers that require an offline or pre-vetted supply chain should preinstall the package and configure the local executable instead.
- Read-only MCP annotations describe Evergreen behavior but do not grant filesystem access. The host remains responsible for sandboxing, repository-path authorization, command approval, and review of any edits an agent makes after receiving migration context.
- Repository parsing currently has no aggregate file-count, byte, depth, finding-count, or wall-time budget, and supported manifests and lockfiles are read in full. A malicious or accidentally huge repository can therefore exhaust CPU or memory in the local MCP process. The established impact is local availability only; no code execution, network access, or repository mutation path was found. Deployments scanning untrusted repositories should add external time/memory limits until Evergreen implements deterministic scanner budgets.

These boundaries follow the official requirement that plugin permissions stay minimal and that annotations do not replace host authorization or confirmation controls in the [OpenAI plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines).

## Live-host MCP discovery

The deterministic plugin eval and the MCP contract tests prove packaged schemas and shared executable behavior. They do not prove that a real MCP host finds the published tools and can call one after installing the released package. After each release, install the released server in one live host, confirm tool discovery, make one sample call, and publish the result in the table below.

### Published results

| Release | Date | Host | Discovery | Sample call |
| --- | --- | --- | --- | --- |
| 0.7.1 | 2026-10-29 | Cursor 3.27.22 (macOS) | Host listed six tools: `check_dependency`, `scan_repository`, `list_deprecations`, `explain_deprecation`, `create_migration_context`, `verify_migration` | `check_dependency` for `pkg:npm/request@2.88.2` returned `affected` / high, rule `npm.package.request.deprecated`, replacement "Native fetch or a maintained HTTP client", source [npm request](https://www.npmjs.com/package/request) |

### How to repeat after a release

1. Install the released MCP entry from [`examples/agents/cursor`](../examples/agents/cursor) (or another host setup under [`examples/agents/`](../examples/agents)), pinning `evergreen-deprecation@X.Y.Z`.
2. Restart or reload the host and confirm it lists the six tools above for the `evergreen` server.
3. Call `check_dependency` with `pkg:npm/request@2.88.2` (or ask the agent to add the `request` package and confirm it makes that call).
4. Append a row to the table with the release version, date, host name and version, discovery result, and sample-call outcome.

## Release gate and limitations

`npm run check` runs `eval:plugins` after build, tests, action-bundle verification, and package drift checks. A release fails if either host misses a corpus case, outputs differ, the workflow cannot complete, untrusted instructions affect results, permissions widen, or a context budget is exceeded.

This deterministic gate evaluates the packaged host contracts and shared executable behavior; it does not claim that every future Codex or Claude model version will make identical autonomous routing choices. Live model observations and the [live-host MCP discovery](#live-host-mcp-discovery) check may supplement this baseline, but they cannot replace or weaken the reproducible release gate. The eval also does not prove host sandbox configuration outside Evergreen's package.

A source-backed security review on 2026-10-15 found one low-severity local availability issue: the missing aggregate scanner budgets described above. It found no path for repository content to replace the workflow contract, inject built-in migration commands, execute suggested commands, open a network listener, or create host-specific executable behavior.
