---
title: GitHub Copilot edit hook
---

# GitHub Copilot edit hook

Copilot's `postToolUse` hook runs after a tool succeeds, in both Copilot CLI and Copilot in the cloud. Evergreen registers it for the `create` and `edit` tools, reads the file from `toolArgs.path` (or `tool_input.file_path` in the PascalCase, VS Code compatible payload), takes the repository root from `cwd`, and answers in the JSON documented for Copilot CLI 1.0.107 (current stable, 2026-11-07) at <https://docs.github.com/en/copilot/reference/hooks-reference>: `additionalContext` is appended to the tool result the model sees, so the agent corrects the file in the same turn, and the hook exits `0` — the tool has already run, so this is feedback, never a block. Copilot may send `toolArgs` as a JSON-encoded string; Evergreen parses it before reading the path. No findings, or any hook failure, prints nothing and exits `0`.

```bash
npx evergreen-deprecation init --hooks-for copilot --dry-run   # show the diff first
npx evergreen-deprecation init --hooks-for copilot             # merge into .github/hooks/evergreen.json
```

The command writes the repository-level file both surfaces load, `<repo>/.github/hooks/evergreen.json` — never anything in your home directory — keeps every existing entry in that file, and leaves the `.github/copilot-instructions.md` that `evergreen setup` manages untouched. Running it again changes nothing:

```json
{
  "version": 1,
  "hooks": {
    "postToolUse": [
      {
        "type": "command",
        "matcher": "create|edit",
        "command": "npx --no-install evergreen-deprecation hook copilot",
        "timeoutSec": 60
      }
    ]
  }
}
```

`matcher` is a regular expression matched against the runtime tool name, and `timeoutSec` is in seconds; Evergreen's own budget stays ten seconds, so a slow scan fails open instead of holding the turn. To turn it off, delete that `postToolUse` entry, or remove the whole file if Evergreen wrote it.

**Copilot in the cloud.** The coding agent runs hooks in GitHub's ephemeral Linux sandbox and loads only `.github/hooks/*.json` files from the repository's default branch, so commit the file and merge it there. The command uses `npx --no-install`, which never downloads a package: `evergreen-deprecation` must already be installed in the checkout. Add it as a dev dependency and install the project's dependencies in the `copilot-setup-steps` job of `.github/workflows/copilot-setup-steps.yml` (documented at <https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/customize-the-agent-environment>):

```yaml
jobs:
  copilot-setup-steps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v7
        with:
          node-version: "22"
          cache: "npm"
      - run: npm ci
```

Copilot CLI reads the same file from the local checkout, where the project's own install or a global `evergreen` bin answers the command.

The transcript below is real output from the built CLI on 2026-11-07, against the fixture repository in `tests/fixtures/agent-hooks/copilot/repo` with the `postToolUse` payload in `post-tool-use.json` (its `cwd` pointed at that repository). The hook prints one JSON object on one line, the form the Copilot documentation recommends for command hooks:

```console
$ cat Dockerfile
FROM node:16
WORKDIR /app
COPY . .
CMD ["node", "index.js"]

$ node dist/src/cli.js hook copilot < posttooluse.json
{"additionalContext":"Evergreen found 1 lifecycle issue in Dockerfile:\n1) [high] Node.js image release lines 21 and older are end-of-life — Dockerfile:1\n   Replacement: A node image on a supported release line, such as node:22\n   Evidence: https://nodejs.org/en/about/eol\n\nFix this before continuing; nothing was changed automatically."}
$ echo $?
0
```

The same payload for a file with no findings then exits `0` with no output:

```console
$ sed -i 's/node:16/node:22/' Dockerfile

$ node dist/src/cli.js hook copilot < posttooluse.json
$ echo $?
0
```
