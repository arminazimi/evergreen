---
title: Cline edit hook
---

# Cline edit hook

Cline's `PostToolUse` file hook runs after a tool completes in the VS Code extension. Evergreen registers it for the `write_to_file` and `replace_in_file` tools (`insert_content` on newer builds), reads `postToolUse.parameters.path`, takes the workspace root from `workspaceRoots`, and answers in the JSON documented for Cline 4.1.26 (current stable, 2026-10-26) in Cline's workspace hooks reference at <https://github.com/cline/cline/blob/main/.clinerules/hooks/README.md> (checked 2026-11-08): `contextModification` is added to the conversation and reaches the model on its next request. The CLI and SDK file hooks documented at <https://github.com/cline/cline/blob/main/sdk/examples/hooks/README.md> send `tool_result.name` and `tool_result.input`; Evergreen reads those too and adds the same feedback as `context`. The tool has already run, so the hook exits `0`; no findings, or any hook failure, prints nothing and exits `0`.

Cline keeps one executable file per event instead of a list of entries, so `init` writes the project-level `.clinerules/hooks/PostToolUse` and refuses to replace a file Evergreen did not write; every other hook in `.clinerules/hooks/` stays untouched. Turn on **Enable Hooks** in Cline's feature settings, because Cline runs no hook while that setting is off. Cline's file hooks are macOS and Linux only; its documentation does not support Windows hooks yet.

```bash
npx evergreen-deprecation init --hooks-for cline --dry-run   # show the script first
npx evergreen-deprecation init --hooks-for cline             # write .clinerules/hooks/PostToolUse
```

The command creates the file executable (`chmod 755`) with this content. Running it again changes nothing:

```bash
#!/usr/bin/env bash
# Evergreen checks the file Cline's PostToolUse payload names; it only prints and never edits files.
exec npx --no-install evergreen-deprecation hook cline
```

`npx --no-install` uses the Evergreen the project already has and never downloads one; where the package is not installed locally, the globally installed `evergreen` bin answers the same command. The hook scans offline, prints only, and never edits the file. Its own budget is ten seconds, so a slow scan fails open instead of holding the turn. To turn it off, delete that file, or turn off Enable Hooks for a session.

The transcript below is real output from the built CLI on 2026-11-08, against the fixture repository in `tests/fixtures/agent-hooks/cline/repo` with the `PostToolUse` payload in `post-tool-use.json` (its `workspaceRoots` pointed at that repository):

```console
$ cat Dockerfile
FROM node:16
WORKDIR /app
COPY . .
CMD ["node", "index.js"]

$ node dist/src/cli.js hook cline < posttooluse.json
{"cancel":false,"contextModification":"Evergreen found 1 lifecycle issue in Dockerfile:\n1) [high] Node.js image release lines 21 and older are end-of-life — Dockerfile:1\n   Replacement: A node image on a supported release line, such as node:22\n   Evidence: https://nodejs.org/en/about/eol\n\nFix this before continuing; nothing was changed automatically.","context":"Evergreen found 1 lifecycle issue in Dockerfile:\n1) [high] Node.js image release lines 21 and older are end-of-life — Dockerfile:1\n   Replacement: A node image on a supported release line, such as node:22\n   Evidence: https://nodejs.org/en/about/eol\n\nFix this before continuing; nothing was changed automatically."}
$ echo $?
0
```

Cline adds that context to its next request, which rewrites the base image. The same payload for a file with no findings then exits `0` with no output:

```console
$ sed -i 's/node:16/node:22/' Dockerfile

$ node dist/src/cli.js hook cline < posttooluse.json
$ echo $?
0
```
