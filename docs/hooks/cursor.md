---
title: Cursor edit hook
---

# Cursor edit hook

Cursor's `afterFileEdit` hook runs after the Agent edits a file. Evergreen reads `file_path` and `workspace_roots` from the payload documented at <https://cursor.com/docs/hooks> (checked 2026-11-07 against the current Hooks reference; Cursor's project file is `.cursor/hooks.json` with `"version": 1`). **Limitation:** that reference documents no response fields for `afterFileEdit` that reach the agent — unlike Claude Code, Codex, and Gemini CLI, Cursor cannot feed findings back into the chat from this hook. Evergreen therefore:

1. Writes an always-applied instruction in `.cursor/rules/evergreen.mdc` only through `init` (never at hook time), so the agent still knows to check lifecycle status before adding a dependency.
2. Keeps the hook as an audit log on stderr and exits `0`. No findings, or any hook failure, prints nothing and exits `0`.

```bash
npx evergreen-deprecation init --hooks-for cursor --dry-run   # show the diff first
npx evergreen-deprecation init --hooks-for cursor             # merge into .cursor/hooks.json and keep the rule
```

The command writes only the project-level file Cursor documents, `<repo>/.cursor/hooks.json` — never anything in your home directory — keeps every existing key and hook, appends one `afterFileEdit` entry, and keeps (or creates) `.cursor/rules/evergreen.mdc`. Running it again changes nothing:

```json
{
  "version": 1,
  "hooks": {
    "afterFileEdit": [
      {
        "command": "npx --no-install evergreen-deprecation hook cursor",
        "timeout": 60
      }
    ]
  }
}
```

If the workspace already has a `hooks.json`, the entry is merged into its `hooks.afterFileEdit` list. To turn it off, delete that entry, or remove the whole `.cursor/hooks.json` if Evergreen wrote it. The project rule stays until you delete `.cursor/rules/evergreen.mdc`.

The transcript below is real output from the built CLI on 2026-11-07, against a repository holding the fixture Dockerfile from `tests/fixtures/agent-hooks/cursor/repo` with the `afterFileEdit` payload in `after-edit.json` (its `workspace_roots` pointed at that repository):

```console
$ cat Dockerfile
FROM node:16
WORKDIR /app
COPY . .
CMD ["node", "index.js"]

$ node dist/src/cli.js hook cursor < afterfileedit.json
Evergreen found 1 lifecycle issue in Dockerfile:
1) [high] Node.js image release lines 21 and older are end-of-life — Dockerfile:1
   Replacement: A node image on a supported release line, such as node:22
   Evidence: https://nodejs.org/en/about/eol

Fix this before continuing; nothing was changed automatically.
$ echo $?
0
```

That stderr is an audit log for the developer or CI watcher; Cursor does not inject it into the agent's context. The same payload for a file with no findings then exits `0` with no output:

```console
$ sed -i 's/node:16/node:22/' Dockerfile

$ node dist/src/cli.js hook cursor < afterfileedit.json
$ echo $?
0
```
