---
title: Claude Code edit hook
---

# Claude Code edit hook

Claude Code's `PostToolUse` hook runs after a tool finishes. Evergreen registers it for `Write`, `Edit`, and `MultiEdit`, reads `tool_input.file_path`, and answers in the protocol documented for Claude Code 2.1.316 (current stable, 2026-11-01) at <https://code.claude.com/docs/en/hooks>: `PostToolUse` cannot block a tool that already ran, and exit code `2` shows the hook's stderr to Claude so it can correct the file in the same turn. No findings, or any hook failure, prints nothing and exits `0`.

```bash
npx evergreen-deprecation init --hooks-for claude-code --dry-run   # show the diff first
npx evergreen-deprecation init --hooks-for claude-code             # merge into .claude/settings.json
```

The command keeps every existing setting and hook — including the pre-install guard below — and adds one entry. Running it again changes nothing:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "npx --no-install evergreen-deprecation hook claude-code",
            "timeout": 60
          }
        ]
      }
    ]
  }
}
```

`npx --no-install` uses the Evergreen the project already has and never downloads one; where the package is not installed locally, the globally installed `evergreen` bin answers the same command. The hook scans offline, prints only, and never edits the file. Its own budget is ten seconds, so a slow scan fails open instead of holding the turn.

To turn it off, delete that `PostToolUse` entry from `.claude/settings.json`, or set `"disableAllHooks": true` (or pass `--settings '{"disableAllHooks": true}'`) to turn off every Claude Code hook for a session.

The transcript below is real output from the built CLI on 2026-11-01, against the fixture repository in `tests/fixtures/agent-hooks/claude-code/repo` with the `PostToolUse` payload in `write.json`:

```console
$ cat Dockerfile
FROM node:16
WORKDIR /app
COPY . .
CMD ["node", "index.js"]

$ node dist/src/cli.js hook claude-code < posttooluse.json
Evergreen found 1 lifecycle issue in Dockerfile:
1) [high] Node.js image release lines 21 and older are end-of-life — Dockerfile:1
   Replacement: A node image on a supported release line, such as node:22
   Evidence: https://nodejs.org/en/about/eol

Fix this before continuing; nothing was changed automatically.
$ echo $?
2
```

Claude Code shows that stderr to the model, which rewrites the base image. The same payload then exits `0` with no output:

```console
$ sed -i 's/node:16/node:22/' Dockerfile

$ node dist/src/cli.js hook claude-code < posttooluse.json
$ echo $?
0
```
