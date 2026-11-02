---
title: Install
description: One page for every Evergreen install channel — npm, Action, MCP, plugins, Docker, and Homebrew.
---

# Install

Pick the channel you already use. Every surface runs the same CLI, so a scan gives the same findings wherever it runs. Channel status and listings are in [Distribution status](DISTRIBUTION.md).

Coding agent? One command installs the Agent Skill, which teaches it to find, explain, and migrate findings. It is listed on [skills.sh](https://skills.sh/arminazimi/evergreen/evergreen-deprecation):

```bash
npx skills add arminazimi/evergreen
```

## npm

Needs Node.js 22 or newer. No global install required:

```bash
npx evergreen-deprecation scan .
```

To keep a pinned version on your `PATH`:

```bash
npm install -g evergreen-deprecation
evergreen scan .
```

**Verify.** `npx evergreen-deprecation --version` prints the published version (currently `0.7.1`). `npx evergreen-deprecation scan examples/demo` reports findings for the demo project.

## GitHub Action

Add the Action to a pull-request workflow:

```yaml
- uses: actions/checkout@v7
- uses: arminazimi/evergreen@v0.7.1
  with:
    fail-on-severity: high
```

**Verify.** Open a pull request that changes a dependency. The job runs, writes annotations for findings, and exits non-zero when a finding meets the severity gate. Details: [GitHub Action](GITHUB_ACTION.md).

## MCP

Start the local stdio server from the published package (no account or API key):

```bash
npx --yes --package evergreen-deprecation evergreen-mcp
```

Point your MCP host at that command. Example config shape:

```json
{
  "mcpServers": {
    "evergreen": {
      "command": "npx",
      "args": ["--yes", "--package", "evergreen-deprecation", "evergreen-mcp"]
    }
  }
}
```

**Verify.** The host lists Evergreen tools including `check_dependency`. Call it for `pkg:npm/request` and confirm it reports the deprecation with a replacement and sources. Details and one-command installs per host: [Local MCP server](MCP.md).

## Plugins

Claude Code and Codex get the Skill, MCP server, and dependency guard in one install.

Claude Code:

```bash
claude plugin install evergreen --marketplace arminazimi/evergreen
```

**Verify.** `claude plugin list` shows `evergreen@evergreen` enabled. Details: [Claude plugin](CLAUDE_PLUGIN.md).

Codex:

```bash
codex plugin marketplace add arminazimi/evergreen --ref main && codex plugin add evergreen@evergreen-codex
```

**Verify.** `codex plugin list --json` shows `evergreen@evergreen-codex` installed and enabled. Details: [Codex plugin](CODEX_PLUGIN.md).

For the portable Skills alone (any skills.sh host):

```bash
npx skills add arminazimi/evergreen --skill evergreen-deprecation --yes
```

**Verify.** The host lists `evergreen-deprecation`. Details: [Agent Skills](AGENT_SKILLS.md). Other agent hosts: [Evergreen for your agent](AGENTS_SETUP.md).

## Docker

The image is `ghcr.io/arminazimi/evergreen` (`latest` and each release tag). Mount the repository at `/workspace`; scans use no network:

```bash
docker run --rm --network none --read-only -v "$PWD:/workspace:ro" \
  ghcr.io/arminazimi/evergreen:latest scan /workspace
```

On Apple Silicon, pass `--platform linux/amd64` because the image is published for that architecture.

**Verify.** `docker run --rm ghcr.io/arminazimi/evergreen:latest --version` prints the image's CLI version. A scan of a mounted repo returns the same finding schema as npm.

## Homebrew

```bash
brew install arminazimi/tap/evergreen
```

**Verify.** `evergreen --version` prints the formula version, and `evergreen scan examples/demo` (from a clone) reports the demo findings.

## Standalone binaries

Each GitHub Release attaches binaries that need no Node.js. Download the asset for your OS, make it executable, and run it like the npm CLI. Details: [Releasing — standalone binaries](RELEASING.md#standalone-binaries).

**Verify.** `./evergreen --version` matches the release tag you downloaded.
