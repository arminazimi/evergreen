---
title: Hooks
---

# Hooks

Evergreen ships a Git pre-push hook that scans before you push, a Claude Code `PreToolUse` hook that checks packages before an agent installs them, and a Cursor project rule that tells the agent to check a dependency before it is added. All of them stay offline and use only the lifecycle rules bundled with Evergreen.

## Git pre-push

`evergreen init --hooks` installs a Git pre-push hook that scans the repository before every push and blocks it when a finding reaches a severity you choose. It uses only local files; the scan never uses the network.

```bash
npx evergreen-deprecation init --hooks --dry-run   # show the hook first
npx evergreen-deprecation init --hooks             # install it
npx evergreen-deprecation init --agents --hooks    # also add the agent instructions
```

### What the Git hook does

It runs `evergreen-deprecation scan . --fail-on <severity> --format compact`. The default gate is `high`; choose another with `--fail-on low|medium|high|critical`. Only findings at or above the gate block the push (exit code 1). If Evergreen is not installed in the project, or a scan fails for another reason, the push is not blocked.

`scan --fail-on <severity|none>` works on its own too, for example in CI. Without it, `scan` exits 0 as before.

### Safe to run again

The hook holds one block between `# >>> evergreen pre-push >>>` and `# <<< evergreen pre-push <<<`. Running `init --hooks` again leaves a current block unchanged, and rewrites only that block when the gate changes. It creates `.git/hooks/pre-push` (honoring `core.hooksPath`) as an executable script.

Evergreen never overwrites a hook it did not write. If `pre-push` already exists without the block, the command stops and prints the line to add to it yourself.

### Husky and Lefthook

When a `.husky/` folder or a `lefthook.yml` exists, that tool owns the hooks, so Evergreen writes nothing and prints what to add:

```bash
# .husky/pre-push
npx --no-install evergreen-deprecation scan . --fail-on high --format compact
```

```yaml
# lefthook.yml
pre-push:
  commands:
    evergreen:
      run: npx --no-install evergreen-deprecation scan . --fail-on high --format compact
```

### The pre-commit framework

Teams that use [pre-commit](https://pre-commit.com) add Evergreen with three lines of config. Pin `rev` to a release tag so everyone runs the same scanner:

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/arminazimi/evergreen
    rev: v0.7.1
    hooks:
      - id: evergreen
```

The repository defines two hooks in `.pre-commit-hooks.yaml`, both `language: node`:

| Hook | Runs |
|---|---|
| `evergreen` | On every commit. |
| `evergreen-changed-manifests` | Only when a manifest, lockfile, or CI workflow file is part of the commit. |

Both run `evergreen scan . --fail-on high --format compact`, so a commit is blocked by a `high` or `critical` finding. The scan reads the whole repository, because a finding depends on more than the staged files, and it stays offline. To change the gate, override `entry` in your config:

```yaml
    hooks:
      - id: evergreen-changed-manifests
        entry: evergreen scan . --fail-on critical --format compact
```

Use `SKIP=evergreen git commit` to skip only Evergreen, or `git commit --no-verify` to skip every hook.

### Bypass the Git hook

```bash
git push --no-verify          # skip every hook for this push
EVERGREEN_SKIP=1 git push     # skip only Evergreen
```

To remove the hook, delete the marked block (or the file, if it holds only that block).

### One setup for every repository

`evergreen init --personal` protects every repository on your machine. It writes `~/.config/evergreen/config.json` (honoring `XDG_CONFIG_HOME`) and a pre-push hook in `~/.config/evergreen/git-hooks/`, then runs `git config --global core.hooksPath` to point Git at it.

```bash
npx evergreen-deprecation init --personal --dry-run   # show what would be written
npx evergreen-deprecation init --personal             # ask, then write
npx evergreen-deprecation init --personal --yes       # confirm without asking
```

It asks before writing anything; without a terminal it needs `--yes`. `--fail-on <severity>` sets the gate (default `high`). Running it again changes nothing when the setup is current.

A global hooks path replaces each repository's own `.git/hooks`, so the personal hook runs the repository's own `pre-push` afterwards, if it has one. Evergreen stops without changes when Git already uses a different global hooks path, or when the hook file there is not its own. Bypass and removal work as above; to remove it, run `git config --global --unset core.hooksPath`.

## Claude Code pre-install

The Claude Code hook runs before Bash tool calls. When the command is an `npm`, `pnpm`, `yarn`, `pip`, or `uv` install that names packages, each package is checked with `evergreen check` (in parallel). If Evergreen's lifecycle rules mark it as deprecated or end-of-life, the install is denied and Claude sees the reason, replacement, and evidence. Installs with no package arguments (for example `npm install` or `pip install -r requirements.txt`), packages with no rule, check failures, and check timeouts do not block — a timeout fails open so the install can proceed.

This is a best-effort guardrail, not a security boundary. The hook inspects the top-level Bash command and splits on `&&`, `||`, `;`, `|`, `&`, and newlines; nested invocations such as `bash -c "npm i request"` are not inspected.

### Install

1. Copy the hook script into the project:

```bash
mkdir -p .claude/hooks
cp integrations/claude-code/pre-install-guard.mjs .claude/hooks/
```

From a clone of this repository the path above works as written. From a release checkout, take the same file from the tree at that tag.

2. Merge the PreToolUse entry from `integrations/claude-code/hooks.json` into `.claude/settings.json` (or `~/.claude/settings.json` for every project):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/pre-install-guard.mjs\"",
            "timeout": 60
          }
        ]
      }
    ]
  }
}
```

The hook pins `npx --yes --package evergreen-deprecation@<version>` to the same release as this repository. The first run may download that package from the network; once it is cached, each check and the lifecycle scan itself stay offline. Set `EVERGREEN_CHECK_COMMAND` to another Evergreen command when you want a local build, for example a JSON array of argv: `["node","/path/to/dist/src/cli.js"]`.

### Opt out

```bash
EVERGREEN_SKIP=1            # skip only this Evergreen hook for the session
EVERGREEN_SKIP=true         # same
```

Only the values `1` and `true` skip the hook (`EVERGREEN_SKIP=0` does not). Or set `"disableAllHooks": true` in `.claude/settings.json` (or pass `--settings '{"disableAllHooks": true}'` for one run) to turn off every Claude Code hook, including this one. To remove the hook permanently, delete its entry from settings and the copied script under `.claude/hooks/`.

## Cursor rules

Cursor reads project rules from `.cursor/rules/`, and a rule with `alwaysApply: true` is included in every chat. Evergreen ships the rule in two places, byte for byte identical, kept in sync by a test in this repository: `integrations/cursor/evergreen.mdc` for the install below, and `examples/agents/cursor/.cursor/rules/evergreen.mdc` in the complete host example verified in Cursor 3.25.9 on macOS (see that README for what the host actually did).

The rule is an instruction, not an enforcement point: nothing blocks an edit the way the Claude Code hook can. The check itself stays offline, whether it goes through MCP or the CLI as below; only a first uncached `npx` run reaches the network to fetch the pinned package.

### Install

1. Copy the rule into the project from a clone of this repository (from a release checkout, take the same file from the tree at that tag):

```bash
mkdir -p .cursor/rules
cp integrations/cursor/evergreen.mdc .cursor/rules/
```

Cursor reads only rules with the `.mdc` extension, so the extension is not optional. `evergreen setup` writes the same text into an existing `.cursor/rules/evergreen.mdc` when it detects a Cursor configuration; it asks before touching a file it did not write.

2. To have the agent call the MCP tool, follow `examples/agents/cursor/README.md` to add the `evergreen` server to `.cursor/mcp.json` and enable it in Cursor. Without MCP the rule says what to run instead: `npx evergreen-deprecation check <purl>`.

### What the rule does

Before Cursor's agent adds a package, runtime, or GitHub Action, or picks one to replace another, it calls `check_dependency` with a Package URL such as `pkg:npm/request@2.88.2` or `pkg:github/actions/checkout@v4`. When the status is `affected`, it prefers the replacement the finding names and cites the evidence links; `version-dependent` means it checks again with the exact version it intends to use, and `no-data` means Evergreen has no rule for that package, not that it is safe. The rule tells the agent not to use Evergreen for security audits or for routine upgrades the project already uses.

## A digest for your personal projects

`evergreen watch` re-scans the projects you register and prints only what is new since the last digest, so a new end-of-life date shows up once.

```bash
npx evergreen-deprecation watch add ~/code/my-app     # register a project
npx evergreen-deprecation watch list                  # show registered projects
npx evergreen-deprecation watch                       # re-scan and print what changed
npx evergreen-deprecation watch --weekly              # do nothing unless a week has passed since the last digest
npx evergreen-deprecation watch remove ~/code/my-app  # stop watching
```

The project list and what each digest already reported live in `~/.config/evergreen/watch.json` (honoring `XDG_CONFIG_HOME`). A finding is reported again only when its deadline changes. A project that cannot be scanned is named in the digest and keeps its history. Scans stay offline.

For a weekly reminder, run it from cron or a login script, for example `0 9 * * 1 npx evergreen-deprecation watch --weekly`. `--json` prints an `evergreen.watch.v1` document.
