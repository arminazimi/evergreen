---
title: Devin Local edit hook
---

# Devin Local edit hook

Devin Local (the agent in Devin Desktop, formerly Windsurf) runs a `PostToolUse` hook after a tool finishes. Evergreen registers it for the `write`, `edit`, and `apply_patch` tools, reads the path from `tool_input.file_path` (and Codex-style patch headers for `apply_patch`), takes the project root from `DEVIN_PROJECT_DIR`, and answers in the JSON documented at <https://docs.devin.ai/cli/extensibility/hooks/overview.md> (checked 2026-11-08 against Devin Desktop 3.12.17, 2026-11-06): `hookSpecificOutput.additionalContext` is injected into the agent's context for `PostToolUse`, and the hook exits `0` — the tool has already run, so this is feedback the model acts on in the same turn, never an error. No findings, or any hook failure, prints nothing and exits `0`.

```bash
npx evergreen-deprecation init --hooks-for devin --dry-run   # show the diff first
npx evergreen-deprecation init --hooks-for devin             # merge into .devin/hooks.v1.json
```

The command writes only the project-level file Devin documents, `<repo>/.devin/hooks.v1.json` — never anything in your home directory — keeps every existing event and hook, and appends one `PostToolUse` entry. In that file the hooks object is the entire document (no wrapper key). Running it again changes nothing:

```json
{
  "PostToolUse": [
    {
      "matcher": "^(write|edit|apply_patch)$",
      "hooks": [
        {
          "type": "command",
          "command": "npx --no-install evergreen-deprecation hook devin",
          "timeout": 60
        }
      ]
    }
  ]
}
```

`matcher` is a regular expression matched against `tool_name`, and `timeout` is in seconds. Evergreen's own budget stays ten seconds, so a slow scan fails open instead of holding the turn. Devin also loads Claude Code hooks from `.claude/settings.json` by default (`read_config_from.claude`), so `--hooks-for claude-code` remains a stopgap; this file is the documented Devin format. To turn it off, delete that `PostToolUse` entry, or remove the whole `.devin/hooks.v1.json` if Evergreen wrote it.

The transcript below is real output from the built CLI on 2026-11-08, against the fixture repository in `tests/fixtures/agent-hooks/devin/repo` with the `PostToolUse` payload in `write.json` (its `DEVIN_PROJECT_DIR` pointed at that repository):

```console
$ cat Dockerfile
FROM node:16
WORKDIR /app
COPY . .
CMD ["node", "index.js"]

$ DEVIN_PROJECT_DIR=$PWD node dist/src/cli.js hook devin < posttooluse.json
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "Evergreen found 1 lifecycle issue in Dockerfile:\n1) [high] Node.js image release lines 21 and older are end-of-life — Dockerfile:1\n   Replacement: A node image on a supported release line, such as node:22\n   Evidence: https://nodejs.org/en/about/eol\n\nFix this before continuing; nothing was changed automatically."
  }
}
$ echo $?
0
```

Devin injects that `additionalContext` into the agent's context, which rewrites the base image in the same turn. The same payload for a file with no findings then exits `0` with no output:

```console
$ sed -i 's/node:16/node:22/' Dockerfile

$ DEVIN_PROJECT_DIR=$PWD node dist/src/cli.js hook devin < posttooluse.json
$ echo $?
0
```
