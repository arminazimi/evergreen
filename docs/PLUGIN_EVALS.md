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

## Release gate and limitations

`npm run check` runs `eval:plugins` after build, tests, action-bundle verification, and package drift checks. A release fails if either host misses a corpus case, outputs differ, the workflow cannot complete, untrusted instructions affect results, permissions widen, or a context budget is exceeded.

This deterministic gate evaluates the packaged host contracts and shared executable behavior; it does not claim that every future Codex or Claude model version will make identical autonomous routing choices. Live model observations may supplement this baseline, but they cannot replace or weaken the reproducible release gate. The eval also does not prove host sandbox configuration outside Evergreen's package.

A source-backed security review on 2026-10-15 found one low-severity local availability issue: the missing aggregate scanner budgets described above. It found no path for repository content to replace the workflow contract, inject built-in migration commands, execute suggested commands, open a network listener, or create host-specific executable behavior.
