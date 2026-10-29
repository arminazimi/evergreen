---
title: Threat model
---

# Threat model

Evergreen reads code it did not write, loads data it did not build at the same time as the code, and gives answers to tools that can edit and install. This page records what v1 trusts, the threats each surface faces, what mitigates them, and what remains. [Privacy](PRIVACY.md) lists the exact capabilities of every command; [Lifecycle data](DATA.md) explains bundle signatures. This page connects them.

## Scope and assumptions

In scope: the CLI scan path, the GitHub Action and GitLab component, lifecycle data bundles, the local MCP server, and the Git and agent hooks.

Out of scope: compromise of the operating system or the user's account, vulnerabilities in npm packages Evergreen depends on, the correctness of the Sigstore and GitHub infrastructure, and what an AI host does with the answers it receives. Report Evergreen vulnerabilities through [SECURITY.md](../SECURITY.md).

Assumptions:

- **Repository contents are untrusted.** A repository may be hostile and may be written to make a scan look clean.
- **The machine and the user are trusted.** The person running Evergreen can already read the files it reads and run the commands it runs.
- **The agent is semi-trusted.** A coding agent using the MCP server can be manipulated by content it reads, including repository text that Evergreen returns.
- **Verified data is authentic, not necessarily correct.** A signature proves which workflow published a rule, not that the claim is true.
- **Hooks are guardrails, not boundaries.** Everything they add can be bypassed by the user and by commands they do not parse.

## Trust boundaries

| From | To | What crosses |
|---|---|---|
| Repository | Detectors and source analysis | File contents, parsed as data only |
| Signed release | Registry and scan engine | Declarative rules, after verification |
| Scan engine | CLI output and MCP host | Findings, file paths, short source excerpts |
| Hook | Package manager, Git, agent | A denial, or the user's command after a passing check |
| Evergreen | Network | Only `data update`, a first `npx` fetch, a configured PR comment, and the package manager's own traffic |

## Untrusted repositories

This surface covers `scan`, `explain`, `context`, `diff`, the GitHub Action, and the GitLab component. Detectors parse manifests, lockfiles, workflows, and source text; they never evaluate it, and the scan path never starts a child process or uses the network.

| STRIDE | Threat | Mitigation | Residual risk |
|---|---|---|---|
| Spoofing | A repository supplies a status file or a modified baseline that hides its own findings from a reader or an agent. | Findings always name the rule, the file, and the exact line; `EVERGREEN_STATUS.md` is described as a snapshot; a baseline's suppressions are counted and reported; neither can change a rule. | A committed status file can be stale or forged for a human reader, and a pull request can edit the CI baseline. Reviewers must review baseline changes and re-scan. |
| Tampering | Malformed, duplicate, or contradictory input makes a parser miss a declaration, crash the scan, or report a wrong location. | Strict parsers; malformed input yields no declaration instead of a guess; unreadable directories are skipped; scans are deterministic. | Detection is declaration-based. A repository can declare one runtime and use another, and an unsupported syntax can hide a usage until a detector learns it. |
| Repudiation | There is no record of what a scan saw. | Not a logging product; CI keeps the JSON report, and an opt-in local usage log records `check` calls. | A local scan leaves no audit trail by default. |
| Information disclosure | Findings embed file paths and source excerpts that appear in logs, pull request comments, or an agent's context. | Reads stay local; the Action posts a comment only when asked; no Evergreen service receives results. | Whatever reads the output, including a hosted agent, receives the excerpts and applies its own policy. |
| Denial of service | A huge file, deeply nested JSON, a symlink cycle, or a pathological source file stalls the scan. | Per-file read caps of about 1 MB, JSON nesting capped at 64, symlinks not followed, unreadable paths skipped, bounded alias and depth budgets in source parsers. | A very large tree still costs time and memory; there is no global wall-clock budget, and CI jobs have their own timeouts. |
| Elevation of privilege | Repository content achieves execution, or text in a file instructs the agent that reads the findings. | Parsers never evaluate; no `eval`, no child process, no network in the scan path; the MCP prompt and migration packet name repository files as untrusted. | Prompt injection is not preventable by the scanner: a comment, a file name, or a manifest string can try to steer the host. The host's permission model is the boundary. |

`diff` is the one scan-path command that runs processes: it calls the local `git` and `tar` to materialize a revision in a temporary directory. They operate on Git objects, not on repository scripts.

## Data bundles

Lifecycle rules travel as one JSON bundle. The release workflow signs it with Sigstore keyless signing; Evergreen verifies it offline before use.

| STRIDE | Threat | Mitigation | Residual risk |
|---|---|---|---|
| Spoofing | A forged bundle claims to carry Evergreen's rules. | The signature must verify against the exact bytes; the signer must be the release workflow at a `data-v…` tag or `main`; chain, validity, and transparency-log inclusion are checked against a trusted root shipped in the package. | The trusted root ages. If Sigstore rotates keys and the installed release is too old, new bundles stop verifying and Evergreen falls back to bundled data. |
| Tampering | A file in a valid bundle is altered, removed, or added. | Every file has a SHA-256 and byte count, the manifest has a content digest, extra and missing files are refused, registry content is validated again, and the format version and minimum Evergreen version must match. | A compromise of the release workflow or of a maintainer who can push a data tag would sign whatever was built. Rule review before `main` is the control there. |
| Repudiation | A bundle's publisher is disputed. | The signing identity is recorded in the public transparency log and can be checked with `cosign`. | Verification is recorded only in local status output. |
| Information disclosure | Updating data reveals what the user is doing. | `data update` requests the public release list, the bundle, and its signature; it sends no repository data and no identifier. | The mirror and the network observe the download, as with any file fetch. |
| Denial of service | An oversized or hostile download exhausts memory or hangs. | 20 MB bundle, 1 MB signature, and 4 MB listing caps; 30-second request timeouts; a mirror can be configured but the same signature check still applies; failure falls back to bundled data. | Repeated failed updates can be retried without limit by the user or a script. |
| Elevation of privilege | A bundle carries executable behavior. | Bundles and registries are declarative JSON, validated before use; no rule field is executed. | A correctly signed but wrong rule affects findings until the next data release. Bundles have no revocation list, and a pinned old bundle stays pinned. |

The local calendar tool's `--bundle FILE` option reads a bundle the user names on the command line. It validates the registry schema but does not verify a signature, because the file is the user's own input, like any other path they pass.

## MCP server

The server speaks MCP over stdio, is started by the host, and is one process per session. It advertises `tools`, `resources`, `prompts`, and `completions`.

| STRIDE | Threat | Mitigation | Residual risk |
|---|---|---|---|
| Spoofing | A host starts a different server, or an unrelated local process claims to be Evergreen. | There is no listener, port, account, or credential to impersonate; the host launches the process it configured, and the plugins pin an exact published version. | A host that resolves an unpinned `npx` package trusts the registry and cache it resolves from. |
| Tampering | A tool changes the repository while "analyzing" it. | Every tool is read-only, has no output, fix, or overwrite option, advertises `readOnlyHint: true`, and runs no command; session findings stay in memory; a test calls every tool and fails if the repository tree changes. | The host still has its own write tools. Evergreen cannot stop an agent from editing after a scan. |
| Repudiation | Nobody can tell which packages an agent was warned about. | An opt-in usage log appends package, result, severity, and rule IDs to a local file. | Nothing is recorded by default, and the log can be edited or deleted by anyone who can read the file. |
| Information disclosure | Tool results carry repository paths and excerpts into a hosted model. | No Evergreen-operated service receives results; the host's policy applies; `check_dependency` reads no repository. | A prompt-injected agent can point `scan_repository` at any path the user can read — not only the project — and surface what it finds. The host's authorization prompt is the boundary. |
| Denial of service | An agent requests scans of very large or repeated trees. | Per-file size caps and deterministic work per file. | The server has no per-request time budget; the host must cancel or time out a call. |
| Elevation of privilege | A tool executes a suggested migration command. | `verify_migration` returns the project commands it suggests; no tool spawns a shell; the `migrate-finding` prompt states that repository files are untrusted and that commands run only under the host's authorization. | The prompt is guidance. A host that auto-approves commands is outside Evergreen's control. |

## Hooks and guardrails

Four mechanisms try to catch a bad dependency at the moment it is added. Each is documented in [Hooks](HOOKS.md).

| Mechanism | What it does | Bypass and residual risk |
|---|---|---|
| Git pre-push hook (`init --hooks`) | Runs `scan . --fail-on <severity>` before a push and blocks at or above the gate. Offline, local rules only. | `git push --no-verify`, `EVERGREEN_SKIP=1`, and deleting the hook. If Evergreen is missing or the scan errors, the push proceeds. It protects only pushes made from this clone. |
| Claude Code `PreToolUse` hook | Splits a top-level Bash command and checks package arguments of `npm`, `pnpm`, `yarn`, `pip`, and `uv` installs. | It inspects only the top-level command: `bash -c`, shell functions, aliases, scripts, `npm install` with no arguments, and lockfile installs are not checked. A 60-second host timeout and per-package budget fail open. The first `npx` run may download the pinned package. |
| `guard` CLI | Checks the npm packages named to `evergreen guard npm install …`, then runs exactly that command if none is refused. | `--force` overrides; arguments the parser does not understand, package scripts, and npm's own resolution and lifecycle scripts are outside the check. It checks lifecycle status, not malware. |
| Cursor rules and Copilot instructions | Tell the agent to call `check_dependency` before adding a package. | Advisory only; nothing blocks an edit. |

Common to all four: they read the same local rules, send nothing, and can be removed by the user. None is a security boundary against a determined person or a misbehaving agent, and none inspects transitive dependencies or the contents of the packages it approves.

## Network reach

Scans use no network. The complete list of network activity in the published package is in [Privacy](PRIVACY.md#command-and-surface-access):

- `data update`: the public release list, a signed bundle, and its signature.
- A first `npx` or package install of Evergreen itself, by the user, the plugin, or a hook.
- The GitHub Action's optional pull request comment, through the GitHub API.
- Whatever package manager a user runs through `guard`.

Maintainer scripts under `tools/` are not part of the published CLI and are excluded from this model.

## Reviewing this model

Update this page in the same pull request as any change to a trust boundary: a new tool that writes, a new network call, a new file format the scanner parses, a new hook, or a change to signature verification. A threat with no mitigation in the table is a bug or an accepted risk that should name its follow-up issue.
