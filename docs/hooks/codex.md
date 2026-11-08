---
title: Codex CLI edit hook
---

# Codex CLI edit hook

Codex CLI's `PostToolUse` hook runs after a tool finishes and matches the patch tool as `apply_patch` (the same tool is also matched as `Edit` or `Write`). Evergreen reads the patch in `tool_input.command`, scans every file it adds or updates, and answers with the JSON documented for the current stable Codex CLI rust-v0.166.0 (2026-10-29) at <https://developers.openai.com/codex/hooks> (redirects to <https://learn.chatgpt.com/docs/hooks>): `hookSpecificOutput.additionalContext` is added to the model's context, `systemMessage` is surfaced as a warning, and the hook exits `0` — the patch has already applied, so this is feedback the model acts on in the next request, never an error. No findings, or any hook failure, prints nothing and exits `0`.

```bash
npx evergreen-deprecation init --hooks-for codex --dry-run   # show the diff first
npx evergreen-deprecation init --hooks-for codex             # merge into .codex/hooks.json
```

The command writes only the project-level file Codex documents, `<repo>/.codex/hooks.json` — never anything in your home directory — keeps every existing key and hook, and appends one entry. Running it again changes nothing:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "apply_patch",
        "hooks": [
          {
            "type": "command",
            "command": "npx --no-install evergreen-deprecation hook codex",
            "timeout": 60
          }
        ]
      }
    ]
  }
}
```

If the workspace already has a `hooks.json`, the entry is merged into its `hooks.PostToolUse` list. To turn it off, delete that entry, or remove the whole `.codex/hooks.json` if Evergreen wrote it.

The transcript below is real output from the built CLI on 2026-11-04, against a repository holding the fixture Dockerfile from `tests/fixtures/agent-hooks/codex/repo` with the `PostToolUse` payload in `patch-update.json` (its `cwd` pointed at that repository):

```console
$ cat Dockerfile
FROM node:16
WORKDIR /app
COPY . .
CMD ["node", "index.js"]

$ node dist/src/cli.js hook codex < posttooluse.json
{
  "systemMessage": "Evergreen found 1 lifecycle issue in the files just changed.",
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "Evergreen found 1 lifecycle issue in Dockerfile:\n1) [high] Node.js image release lines 21 and older are end-of-life — Dockerfile:1\n   Replacement: A node image on a supported release line, such as node:22\n   Evidence: https://nodejs.org/en/about/eol\n\nFix this before continuing; nothing was changed automatically."
  }
}
$ echo $?
0
```

Codex adds that `additionalContext` to the model's context, which rewrites the base image. The same payload for a file with no findings then exits `0` with no output:

```console
$ sed -i 's/node:16/node:22/' Dockerfile

$ node dist/src/cli.js hook codex < posttooluse.json
$ echo $?
0
```
