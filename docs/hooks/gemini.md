---
title: Gemini CLI edit hook
---

# Gemini CLI edit hook

Gemini CLI's `AfterTool` hook runs after a tool executes. Evergreen registers it for the `write_file` and `replace` tools, reads `tool_input.file_path`, takes the project root from `cwd` (with `GEMINI_PROJECT_DIR` as the documented fallback), and answers in the JSON documented for Gemini CLI 0.67.0 (current stable, 2026-11-04) at <https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md>: `hookSpecificOutput.additionalContext` is appended to the tool result in the model's context, `systemMessage` is shown in the terminal, and the hook exits `0` — the tool has already run, so this is feedback the model acts on in the same turn, never an error. No findings, or any hook failure, prints nothing and exits `0`.

```bash
npx evergreen-deprecation init --hooks-for gemini --dry-run   # show the diff first
npx evergreen-deprecation init --hooks-for gemini             # merge into .gemini/settings.json
```

The command writes only the project-level file Gemini CLI documents, `<repo>/.gemini/settings.json` — never anything in your home directory — keeps every existing setting and hook (including `mcpServers`), and appends one `AfterTool` entry. Running it again changes nothing:

```json
{
  "hooks": {
    "AfterTool": [
      {
        "matcher": "write_file|replace",
        "hooks": [
          {
            "name": "evergreen",
            "type": "command",
            "command": "npx --no-install evergreen-deprecation hook gemini",
            "timeout": 60000
          }
        ]
      }
    ]
  }
}
```

`matcher` is a regular expression for tool events, and `timeout` is in milliseconds, so `60000` is Gemini CLI's documented default of one minute; Evergreen's own budget stays ten seconds, so a slow scan fails open instead of holding the turn. To turn it off, delete that `AfterTool` entry, or remove the whole `.gemini/settings.json` if Evergreen wrote it.

The transcript below is real output from the built CLI on 2026-11-07, against the fixture repository in `tests/fixtures/agent-hooks/gemini/repo` with the `AfterTool` payload in `write-file.json` (its `cwd` pointed at that repository):

```console
$ cat Dockerfile
FROM node:16
WORKDIR /app
COPY . .
CMD ["node", "index.js"]

$ node dist/src/cli.js hook gemini < aftertool.json
{
  "systemMessage": "Evergreen found 1 lifecycle issue in the files just changed.",
  "hookSpecificOutput": {
    "hookEventName": "AfterTool",
    "additionalContext": "Evergreen found 1 lifecycle issue in Dockerfile:\n1) [high] Node.js image release lines 21 and older are end-of-life — Dockerfile:1\n   Replacement: A node image on a supported release line, such as node:22\n   Evidence: https://nodejs.org/en/about/eol\n\nFix this before continuing; nothing was changed automatically."
  }
}
$ echo $?
0
```

Gemini CLI appends that `additionalContext` to the tool result, which rewrites the base image in the same turn. The same payload for a file with no findings then exits `0` with no output:

```console
$ sed -i 's/node:16/node:22/' Dockerfile

$ node dist/src/cli.js hook gemini < aftertool.json
$ echo $?
0
```
